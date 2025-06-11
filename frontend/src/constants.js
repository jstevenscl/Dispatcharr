export const USER_LEVELS = {
  STREAMER: 0,
  STANDARD: 1,
  ADMIN: 10,
};

export const USER_LEVEL_LABELS = {
  [USER_LEVELS.STREAMER]: 'Streamer',
  [USER_LEVELS.STANDARD]: 'Standard User',
  [USER_LEVELS.ADMIN]: 'Admin',
};

export const NETWORK_ACCESS_OPTIONS = {
  M3U_EPG: {
    label: 'M3U / EPG Endpoints',
    description: 'Limit access to M3U, EPG, and HDHR URLs',
  },
  STREAMS: {
    label: 'Stream Endpoints',
    description:
      'Limit network access to stream URLs, including XC stream URLs',
  },
  XC_API: {
    label: 'XC API',
    description: 'Limit access to the XC API',
  },
  UI: {
    label: 'UI',
    description: 'Limit access to the Dispatcharr UI',
  },
};
