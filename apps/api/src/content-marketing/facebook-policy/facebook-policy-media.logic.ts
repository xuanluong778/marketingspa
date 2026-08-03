type MediaAnalysis = {
  mediaType: 'image' | 'video' | 'transcript';
  ocrText: string;
  transcript: string;
  caption: string;
  visualNotes: never[];
  regions: never[];
  findings: never[];
  insufficientData: boolean;
  statusHint: 'INSUFFICIENT_DATA';
  warnings: string[];
};

function emptyMedia(mediaType: MediaAnalysis['mediaType']): MediaAnalysis {
  return {
    mediaType,
    ocrText: '',
    transcript: '',
    caption: '',
    visualNotes: [],
    regions: [],
    findings: [],
    insufficientData: true,
    statusHint: 'INSUFFICIENT_DATA',
    warnings: ['Facebook policy media unavailable — source not restored'],
  };
}

export function analyzePolicyImage(..._args: unknown[]): MediaAnalysis {
  return emptyMedia('image');
}

export function analyzePolicyTranscriptOnly(..._args: unknown[]): MediaAnalysis {
  return emptyMedia('transcript');
}

export function analyzePolicyVideo(..._args: unknown[]): MediaAnalysis {
  return emptyMedia('video');
}

export function findingsFromMediaText(..._args: unknown[]): never[] {
  return [];
}
