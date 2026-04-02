/**
 * HLS pipeline: RAW upload → Transcoder → PROCESSED bucket; async status updates in MongoDB.
 */
const path = require('path');
const mongoose = require('mongoose');
const gcs = require('./gcsStorage');
const {
  createTranscoderJob,
  getTranscoderClient,
  formatTranscoderErrorHint,
  normalizeJobState,
} = require('./transcoderJob');
const Course = require('../models/Course');

const DELETE_RAW_AFTER_SUCCESS =
  String(process.env.GCS_DELETE_RAW_AFTER_TRANSCODE || '').toLowerCase() === 'true';

function gsUri(bucketName, objectPath) {
  const p = String(objectPath).replace(/^\/+/, '');
  return `gs://${bucketName}/${p}`;
}

/**
 * Full diagnostic for logs / debugging (why HLS is on or off).
 */
function getHlsPipelineDiagnostics() {
  const provider = (process.env.STORAGE_PROVIDER || 'local').toLowerCase();
  const transcoderDisabled =
    String(process.env.ENABLE_VIDEO_TRANSCODER || 'true').toLowerCase() === 'false';
  const rawBucket = gcs.resolveRawBucketName();
  let reason = '';
  if (provider !== 'gcs') {
    reason = `STORAGE_PROVIDER is "${provider}" (need gcs)`;
  } else if (transcoderDisabled) {
    reason = 'ENABLE_VIDEO_TRANSCODER=false';
  } else if (!rawBucket) {
    reason =
      'No raw bucket: set GCS_BUCKET_RAW_UPLOADS or use a processed bucket name like *-processed-videos for inference';
  }
  const enabled = provider === 'gcs' && !transcoderDisabled && Boolean(rawBucket && rawBucket.trim());
  return {
    enabled,
    reason,
    provider,
    rawBucket: rawBucket || '',
    transcoderDisabled,
  };
}

function isHlsPipelineEnabled() {
  return getHlsPipelineDiagnostics().enabled;
}

/**
 * Call when handling lesson video uploads (create/update course).
 */
function logHlsPipelineDecision(contextLabel) {
  const d = getHlsPipelineDiagnostics();
  const suffix = d.enabled ? '→ using RAW + Transcoder (HLS)' : `→ ${d.reason || 'MP4 fallback'}`;
  console.log(
    `[HLS] ${contextLabel} — ENABLED=${d.enabled} STORAGE_PROVIDER=${d.provider} RAW_BUCKET=${d.rawBucket || '(none)'} ENABLE_VIDEO_TRANSCODER=${!d.transcoderDisabled} ${suffix}`
  );
}

/**
 * Upload original to RAW bucket; return DB fields + URIs for background transcoding.
 * Caller must run scheduleHlsTranscoding after the course document is saved.
 */
async function prepareHlsLessonUpload(filePath, courseId, lessonId) {
  const ext = path.extname(filePath) || '.mp4';
  const merged = gcs.getMergedVideoBucketName();
  /** Doc §1.2 — merged bucket uses raw/… and processed/… prefixes */
  const objectRel = merged
    ? `raw/courses/${courseId}/${lessonId}/original${ext}`
    : `courses/${courseId}/${lessonId}/original${ext}`;

  console.log(`[HLS] Uploading raw video → ${objectRel}`);

  const { bucketName, publicId } = await gcs.uploadRawVideoToGcs(filePath, objectRel);
  const inputUri = gsUri(bucketName, publicId);

  const rawProcessed =
    merged ||
    process.env.GCS_BUCKET_PROCESSED_VIDEOS ||
    process.env.GCS_BUCKET_VIDEOS;
  if (!rawProcessed) {
    throw new Error('Set GCS_MERGED_VIDEO_BUCKET or GCS_BUCKET_PROCESSED_VIDEOS');
  }
  const processedName = gcs.normalizeBucketNameFromEnv(
    rawProcessed,
    merged ? 'GCS_MERGED_VIDEO_BUCKET' : 'GCS_BUCKET_PROCESSED_VIDEOS'
  );

  const outputPrefix = merged
    ? `processed/courses/${courseId}/${lessonId}/`
    : `courses/${courseId}/${lessonId}/`;
  const outputUri = `gs://${processedName}/${outputPrefix}`;
  const playlistKey = `${outputPrefix}playlist.m3u8`;
  const videoUrl = gcs.publicObjectUrl(processedName, playlistKey);
  const duration = gcs.getVideoDurationSeconds(filePath);

  console.log(
    `[HLS] Raw upload success → ${inputUri}; expected playlist URL (MongoDB) → ${videoUrl}`
  );

  const lessonFields = {
    videoUrl,
    videoPublicId: playlistKey,
    videoType: 'hls',
    transcodingStatus: 'pending',
    rawVideoPublicId: publicId,
    transcodingJobName: null,
    duration: duration || 0,
  };

  const scheduleMeta = {
    courseId: String(courseId),
    lessonId: String(lessonId),
    inputUri,
    outputUri,
    rawObjectKey: publicId,
  };

  return { lessonFields, scheduleMeta };
}

async function pollJobUntilTerminal(jobName) {
  const client = getTranscoderClient();
  const maxAttempts = 80;
  const delayMs = 10_000;
  let lastState = -1;

  for (let i = 0; i < maxAttempts; i++) {
    try {
      const [job] = await client.getJob({ name: jobName });
      const state = normalizeJobState(job.state);
      if (state !== lastState) {
        console.log(
          `[Transcoder] Job state=${state} (${String(job.state)}) (${jobName})`
        );
        lastState = state;
      }
      // SUCCEEDED = 3, FAILED = 4 (see Job.ProcessingState in Transcoder API)
      if (state === 3) return { ok: true, job };
      if (state === 4) {
        const msg = job.error?.message || 'Transcoder job failed';
        console.error('[Transcoder] Job failed:', msg);
        return { ok: false, job, error: new Error(msg) };
      }
    } catch (e) {
      console.warn(
        `[Transcoder] getJob transient error (poll ${i + 1}/${maxAttempts}):`,
        formatTranscoderErrorHint(e)
      );
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return { ok: false, error: new Error('Transcoder job timed out') };
}

async function updateLessonTranscodingStatus(courseId, lessonId, patch) {
  const cid = new mongoose.Types.ObjectId(String(courseId));
  const lid = new mongoose.Types.ObjectId(String(lessonId));
  const $set = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) {
      $set[`lessons.$.${k}`] = v;
    }
  }
  await Course.updateOne({ _id: cid, 'lessons._id': lid }, { $set });
}

/**
 * Fire-and-forget: create job, poll, mark lesson ready/failed, optionally delete raw object.
 */
function scheduleHlsTranscoding(meta) {
  const { courseId, lessonId, inputUri, outputUri, rawObjectKey } = meta;

  setImmediate(() => {
    (async () => {
      let jobName;
      try {
        const job = await createTranscoderJob({ inputUri, outputUri });
        jobName = job.name;
        await updateLessonTranscodingStatus(courseId, lessonId, {
          transcodingJobName: jobName,
          transcodingStatus: 'processing',
        });
        console.log(
          `[HLS] Transcoder job created lesson=${lessonId} status=processing job=${jobName}`
        );

        const result = await pollJobUntilTerminal(jobName);
        if (result.ok) {
          console.log(`[HLS] Processing complete — lesson ${lessonId} (HLS playlist in processed bucket)`);
          await updateLessonTranscodingStatus(courseId, lessonId, {
            transcodingStatus: 'ready',
          });
          if (DELETE_RAW_AFTER_SUCCESS && rawObjectKey) {
            try {
              await gcs.deleteRawObject(rawObjectKey);
              await updateLessonTranscodingStatus(courseId, lessonId, {
                rawVideoPublicId: null,
              });
              console.log(`[HLS] Removed raw object ${rawObjectKey}`);
            } catch (e) {
              console.error('[HLS] Raw delete after success failed:', e.message);
            }
          }
        } else {
          console.error(`[HLS] ❌ Transcode failed lesson ${lessonId}:`, result.error?.message);
          await updateLessonTranscodingStatus(courseId, lessonId, {
            transcodingStatus: 'failed',
          });
        }
      } catch (e) {
        console.error('[HLS] ❌ Transcoder error:', formatTranscoderErrorHint(e));
        try {
          await updateLessonTranscodingStatus(courseId, lessonId, {
            transcodingStatus: 'failed',
          });
        } catch (dbErr) {
          console.error('[HLS] Could not persist failed status:', dbErr.message);
        }
      }
    })();
  });
}

module.exports = {
  isHlsPipelineEnabled,
  getHlsPipelineDiagnostics,
  logHlsPipelineDecision,
  prepareHlsLessonUpload,
  scheduleHlsTranscoding,
  gsUri,
};
