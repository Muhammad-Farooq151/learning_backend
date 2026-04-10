
const fs = require('fs');
const { TranscoderServiceClient } = require('@google-cloud/video-transcoder');

const DEFAULT_LOCATION = process.env.GCS_TRANSCODER_LOCATION || 'us-central1';

const CREATE_JOB_MAX_ATTEMPTS = Math.max(
  1,
  Math.min(10, parseInt(process.env.GCS_TRANSCODER_CREATE_RETRIES || '3', 10) || 3)
);
const CREATE_JOB_RETRY_DELAY_MS = Math.max(
  3000,
  parseInt(process.env.GCS_TRANSCODER_RETRY_DELAY_MS || '6000', 10) || 6000
);

let transcoderClientSingleton = null;


function buildTranscoderClientOptions() {
  const projectId = process.env.GCS_PROJECT_ID;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const clientEmail = process.env.GCS_CLIENT_EMAIL;
  const privateKey = process.env.GCS_PRIVATE_KEY;

  const opts = {};

  if (clientEmail && privateKey) {
    if (!projectId) {
      throw new Error('GCS_PROJECT_ID is required when using GCS_CLIENT_EMAIL / GCS_PRIVATE_KEY');
    }
    opts.projectId = projectId;
    opts.credentials = {
      client_email: clientEmail,
      private_key: String(privateKey).replace(/\\n/g, '\n'),
    };
    return opts;
  }

  if (keyFile && fs.existsSync(keyFile)) {
    opts.keyFilename = keyFile;
    if (projectId) {
      opts.projectId = projectId;
    } else {
      try {
        const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
        if (key.project_id) opts.projectId = key.project_id;
      } catch (_) {
        /* fall through */
      }
    }
    if (!opts.projectId) {
      throw new Error(
        'GCS_PROJECT_ID is required for Transcoder (or project_id in the service account JSON)'
      );
    }
    return opts;
  }

  if (projectId) {
    opts.projectId = projectId;
  }
  if (!opts.projectId) {
    throw new Error(
      'Transcoder requires GCS_PROJECT_ID and credentials (GOOGLE_APPLICATION_CREDENTIALS or GCS_CLIENT_EMAIL + GCS_PRIVATE_KEY)'
    );
  }
  return opts;
}

function getServiceAccountEmailForLog() {
  if (process.env.GCS_CLIENT_EMAIL) return process.env.GCS_CLIENT_EMAIL;
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyFile && fs.existsSync(keyFile)) {
    try {
      const key = JSON.parse(fs.readFileSync(keyFile, 'utf8'));
      return key.client_email || '(missing client_email in JSON)';
    } catch (_) {
      return '(could not read key file)';
    }
  }
  return '(Application Default Credentials — email unknown)';
}

function getTranscoderClient() {
  if (!transcoderClientSingleton) {
    const opts = buildTranscoderClientOptions();
    transcoderClientSingleton = new TranscoderServiceClient(opts);
    console.log(
      `[Transcoder] Client initialized — GCS_PROJECT_ID=${opts.projectId} | ` +
        `poll/getJob use the full job.name from createJob (may show projects/{number}/... = same project)`
    );
  }
  return transcoderClientSingleton;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * getJob() may return state as a number OR string enum name (gRPC decode / protobuf-js),
 * e.g. "RUNNING" vs 2. Number("RUNNING") === NaN broke polling — DB never reached "ready".
 */
function normalizeJobState(raw) {
  if (raw === null || raw === undefined) return -1;
  if (typeof raw === 'number' && !Number.isNaN(raw)) return raw;
  const BY_NAME = {
    PROCESSING_STATE_UNSPECIFIED: 0,
    PENDING: 1,
    RUNNING: 2,
    SUCCEEDED: 3,
    FAILED: 4,
  };
  if (typeof raw === 'string' && Object.prototype.hasOwnProperty.call(BY_NAME, raw)) {
    return BY_NAME[raw];
  }
  const n = Number(raw);
  return Number.isNaN(n) ? -1 : n;
}

function isRetryableTranscoderCreateError(err) {
  const msg = `${err.message || ''} ${err.details || ''} ${err.note || ''} ${JSON.stringify(err.metadata || '')}`;
  const code = err.code;
  // INVALID_ARGUMENT (3) = bad config — do not retry
  if (code === 3 || /INVALID_ARGUMENT/i.test(msg)) return false;
  // gRPC: 14 UNAVAILABLE, 4 DEADLINE_EXCEEDED
  if (code === 14 || code === 4 || code === 'UNAVAILABLE' || code === 'DEADLINE_EXCEEDED') return true;
  if (/UNAVAILABLE|503|DEADLINE|ECONNRESET|ETIMEDOUT|RESOURCE_EXHAUSTED/i.test(msg)) return true;
  if (/not been used|is disabled|try again later|internal/i.test(msg)) return true;
  return false;
}

/**
 * Human-readable hints for operators (IAM, API, config).
 */
function formatTranscoderErrorHint(err) {
  const msg = String(err?.message || err);
  const pid = process.env.GCS_PROJECT_ID || '(set GCS_PROJECT_ID)';
  const sa = getServiceAccountEmailForLog();
  if (/PERMISSION_DENIED|permission denied/i.test(msg) || err?.code === 7) {
    return `${msg} | [IAM] Service account ${sa}: grant roles/transcoder.user or roles/transcoder.admin on project ${pid}. Ensure Transcoder API is enabled. Grant Storage access (e.g. objectAdmin) on RAW + PROCESSED buckets.`;
  }
  if (/INVALID_ARGUMENT|invalid argument/i.test(msg) || err?.code === 3) {
    return `${msg} | [Config] Check H264 ladder, GOP vs segment duration, and gs:// input/output URIs.`;
  }
  if (/not been used|disabled/i.test(msg)) {
    return `${msg} | [API] Enable Video Transcoder API for ${pid}; wait a few minutes for propagation or retry.`;
  }
  return msg;
}

/**
 * HLS ladder: H.264 + AAC, MPEG-TS segments.
 * segmentDuration (4s) must align with GOP: use gopDuration 2s so 4 is divisible by 2 (Transcoder constraint).
 */
const GOP_SEC = 2;
const SEGMENT_SEC = 4;

function h264LadderRung(width, height, bitrateBps) {
  return {
    widthPixels: width,
    heightPixels: height,
    frameRate: 30,
    bitrateBps,
    gopDuration: { seconds: GOP_SEC },
    pixelFormat: 'yuv420p',
  };
}

function buildHlsJobConfig(inputUri, outputUri) {
  const segmentSettings = {
    segmentDuration: { seconds: SEGMENT_SEC },
    individualSegments: true,
  };

  return {
    inputs: [{ key: 'input0', uri: inputUri }],
    output: { uri: outputUri },
    elementaryStreams: [
      {
        key: 'v1080',
        videoStream: {
          h264: h264LadderRung(1920, 1080, 5_000_000),
        },
      },
      {
        key: 'v720',
        videoStream: {
          h264: h264LadderRung(1280, 720, 3_000_000),
        },
      },
      {
        key: 'v480',
        videoStream: {
          h264: h264LadderRung(854, 480, 1_000_000),
        },
      },
      {
        key: 'a0',
        audioStream: {
          codec: 'aac',
          bitrateBps: 128_000,
          sampleRateHertz: 48_000,
        },
      },
    ],
    muxStreams: [
      {
        key: 'h1080',
        container: 'ts',
        elementaryStreams: ['v1080', 'a0'],
        segmentSettings,
      },
      {
        key: 'h720',
        container: 'ts',
        elementaryStreams: ['v720', 'a0'],
        segmentSettings,
      },
      {
        key: 'h480',
        container: 'ts',
        elementaryStreams: ['v480', 'a0'],
        segmentSettings,
      },
    ],
    manifests: [
      {
        fileName: 'playlist.m3u8',
        type: 1, // Manifest.ManifestType.HLS
        muxStreams: ['h1080', 'h720', 'h480'],
      },
    ],
  };
}

/**
 * Create an asynchronous transcoding job with retries for propagation / transient errors.
 */
async function createTranscoderJob(opts) {
  const { inputUri, outputUri } = opts;
  const projectId = process.env.GCS_PROJECT_ID;
  if (!projectId) {
    throw new Error('GCS_PROJECT_ID is required for Cloud Transcoder');
  }
  if (!inputUri?.startsWith('gs://') || !outputUri?.startsWith('gs://')) {
    throw new Error('Transcoder inputUri and outputUri must be gs:// URIs');
  }
  const out = outputUri.endsWith('/') ? outputUri : `${outputUri}/`;

  const client = getTranscoderClient();
  const parent = client.locationPath(projectId, DEFAULT_LOCATION);
  const config = buildHlsJobConfig(inputUri, out);

  const saEmail = getServiceAccountEmailForLog();
  console.log('[Transcoder] createJob request', {
    projectId,
    location: DEFAULT_LOCATION,
    parent,
    serviceAccount: saEmail,
    inputUri,
    outputUri: out,
    encoding: { segmentSeconds: SEGMENT_SEC, gopSeconds: GOP_SEC, ladder: '1080p~5Mbps, 720p~3Mbps, 480p~1Mbps' },
  });

  let lastErr;
  for (let attempt = 1; attempt <= CREATE_JOB_MAX_ATTEMPTS; attempt++) {
    try {
      const [job] = await client.createJob({
        parent,
        job: {
          inputUri,
          outputUri: out,
          config,
        },
      });

      console.log(
        `[Transcoder] Job created — ${job.name} state=${job.state} (attempt ${attempt}/${CREATE_JOB_MAX_ATTEMPTS})`
      );
      if (job.name && projectId && !String(job.name).includes(projectId)) {
        console.log(
          `[Transcoder] job.name uses numeric project id in path (expected). Parent used: ${parent}`
        );
      }
      return job;
    } catch (e) {
      lastErr = e;
      console.error(
        `[Transcoder] Job failed attempt ${attempt}/${CREATE_JOB_MAX_ATTEMPTS}:`,
        formatTranscoderErrorHint(e)
      );
      const retry = attempt < CREATE_JOB_MAX_ATTEMPTS && isRetryableTranscoderCreateError(e);
      if (!retry) break;
      console.warn(
        `[Transcoder] Retrying in ${CREATE_JOB_RETRY_DELAY_MS}ms (propagation or transient error)`
      );
      await sleep(CREATE_JOB_RETRY_DELAY_MS);
    }
  }

  console.error('[Transcoder] createJob exhausted retries:', formatTranscoderErrorHint(lastErr));
  throw lastErr;
}

module.exports = {
  buildTranscoderClientOptions,
  buildHlsJobConfig,
  createTranscoderJob,
  getTranscoderClient,
  getServiceAccountEmailForLog,
  formatTranscoderErrorHint,
  normalizeJobState,
  DEFAULT_LOCATION,
  SEGMENT_SEC,
  GOP_SEC,
};
