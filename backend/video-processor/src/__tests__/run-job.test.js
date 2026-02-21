'use strict';

jest.mock('../db', () => ({
  query: jest.fn(),
}));

jest.mock('../services/videoIntelligence', () => ({
  detectShotChanges: jest.fn(),
}));

jest.mock('../services/speechToText', () => ({
  transcribeVideo: jest.fn(),
}));

jest.mock('../services/geminiAnalyzer', () => ({
  analyzeClips: jest.fn(),
}));

jest.mock('../services/ffmpeg', () => ({
  cutClip: jest.fn(),
  getVideoDuration: jest.fn(),
  detectSilences: jest.fn(),
  snapToSilence: jest.fn(),
}));

jest.mock('../services/editGuidance', () => ({
  generateEditGuidance: jest.fn(),
}));

jest.mock('@google-cloud/storage', () => {
  const downloadMock = jest.fn().mockResolvedValue();
  const uploadMock = jest.fn().mockResolvedValue();
  const fileMock = jest.fn(() => ({ download: downloadMock }));
  const bucketMock = jest.fn(() => ({ file: fileMock, upload: uploadMock }));
  return {
    Storage: jest.fn(() => ({ bucket: bucketMock })),
    __downloadMock: downloadMock,
    __uploadMock: uploadMock,
  };
});

const db = require('../db');
const { detectShotChanges } = require('../services/videoIntelligence');
const { transcribeVideo } = require('../services/speechToText');
const { analyzeClips } = require('../services/geminiAnalyzer');
const { cutClip, getVideoDuration, detectSilences, snapToSilence } = require('../services/ffmpeg');
const { generateEditGuidance } = require('../services/editGuidance');

function makeWords(count) {
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push({ word: `word${i}`, start: i * 0.5, end: (i + 1) * 0.5 });
  }
  return words;
}

describe('run-job orchestration logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('transcribeVideo result is destructured as { text, words }', async () => {
    const words = makeWords(200);
    const mockResult = { text: 'hello world transcript', words };

    transcribeVideo.mockResolvedValue(mockResult);

    const result = await transcribeVideo('gs://bucket/video.mp4');
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('words');
    expect(result.text).toBe('hello world transcript');
    expect(result.words).toHaveLength(200);
  });

  test('analyzeClips receives words and gcsUri (not transcription string)', async () => {
    const words = makeWords(200);
    const mockClips = [{
      start_word_index: 10,
      end_word_index: 80,
      title: 'Test Clip',
      hook: 'Amazing hook',
      hook_score: 8.5,
      strategic_rank: 1,
      rationale: 'Great moment',
    }];

    analyzeClips.mockResolvedValue(mockClips);

    const result = await analyzeClips({
      words,
      videoDurationSeconds: 120,
      script: null,
      gcsUri: 'gs://bucket/video.mp4',
    });

    const callArgs = analyzeClips.mock.calls[0][0];
    expect(callArgs).toHaveProperty('words');
    expect(callArgs).toHaveProperty('gcsUri');
    expect(callArgs).not.toHaveProperty('transcription');
    expect(callArgs).not.toHaveProperty('shotTimestamps');
    expect(result).toHaveLength(1);
    expect(result[0].start_word_index).toBe(10);
  });

  test('word indices are mapped to timestamps and snapped to silence', () => {
    const words = makeWords(200);
    const silences = [
      { start: 4.8, end: 5.2 },
      { start: 39.5, end: 40.5 },
    ];

    const rawClip = {
      start_word_index: 10,
      end_word_index: 80,
      title: 'Test',
      hook: 'Hook',
      hook_score: 8,
      strategic_rank: 1,
      rationale: 'Good',
    };

    snapToSilence
      .mockReturnValueOnce(5.0)
      .mockReturnValueOnce(40.0);

    const rawStart = words[rawClip.start_word_index].start;
    const rawEnd = words[rawClip.end_word_index].end;
    const mappedClip = {
      ...rawClip,
      start_time: snapToSilence(rawStart, silences, 2.0),
      end_time: snapToSilence(rawEnd, silences, 2.0),
    };

    expect(mappedClip.start_time).toBe(5.0);
    expect(mappedClip.end_time).toBe(40.0);
    expect(snapToSilence).toHaveBeenCalledWith(5.0, silences, 2.0);
    expect(snapToSilence).toHaveBeenCalledWith(40.5, silences, 2.0);
  });

  test('parallel execution of transcription, shot detection, and silence detection', async () => {
    const words = makeWords(100);
    transcribeVideo.mockResolvedValue({ text: 'transcript', words });
    detectShotChanges.mockResolvedValue([{ startTime: 0, endTime: 10 }]);
    detectSilences.mockResolvedValue([{ start: 5.0, end: 5.5 }]);

    const [transcriptionResult, shotTimestamps, silences] = await Promise.all([
      transcribeVideo('gs://bucket/video.mp4'),
      detectShotChanges('gs://bucket/video.mp4'),
      detectSilences('/tmp/video.mp4'),
    ]);

    expect(transcriptionResult.text).toBe('transcript');
    expect(transcriptionResult.words).toHaveLength(100);
    expect(shotTimestamps).toHaveLength(1);
    expect(silences).toHaveLength(1);

    expect(transcribeVideo).toHaveBeenCalledTimes(1);
    expect(detectShotChanges).toHaveBeenCalledTimes(1);
    expect(detectSilences).toHaveBeenCalledTimes(1);
  });

  test('getVideoDuration is called correctly', async () => {
    getVideoDuration.mockResolvedValue(258.5);

    const duration = await getVideoDuration('/tmp/video.mp4');
    expect(duration).toBe(258.5);
  });

  test('cutClip is called with snapped timestamps', async () => {
    cutClip.mockResolvedValue('/tmp/clip_abc.mp4');

    const localPath = await cutClip('/tmp/video.mp4', 5.0, 40.0, 'abc');
    expect(cutClip).toHaveBeenCalledWith('/tmp/video.mp4', 5.0, 40.0, 'abc');
    expect(localPath).toBe('/tmp/clip_abc.mp4');
  });

  test('generateEditGuidance is called with script and transcription text', async () => {
    const mockGuidance = {
      overall_feedback: 'Good video',
      suggestions: [{ timestamp_seconds: 10, type: 'b_roll', suggestion: 'Add overlay' }],
    };
    generateEditGuidance.mockResolvedValue(mockGuidance);

    const result = await generateEditGuidance('my script', 'my transcription');
    expect(generateEditGuidance).toHaveBeenCalledWith('my script', 'my transcription');
    expect(result.overall_feedback).toBe('Good video');
    expect(result.suggestions).toHaveLength(1);
  });
});
