'use strict';

// Mock VertexAI before requiring the module
jest.mock('@google-cloud/vertexai', () => {
  const mockGenerateContent = jest.fn();
  return {
    VertexAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue({
        generateContent: mockGenerateContent,
      }),
    })),
    __mockGenerateContent: mockGenerateContent,
  };
});

const { __mockGenerateContent } = require('@google-cloud/vertexai');

// Helper: generate a words array with N words
function makeWords(count) {
  const words = [];
  for (let i = 0; i < count; i++) {
    words.push({ word: `word${i}`, start: i * 0.5, end: (i + 1) * 0.5 });
  }
  return words;
}

describe('Gemini Analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('analyzeClips returns parsed clips from Gemini response', async () => {
    const words = makeWords(200);
    const mockClips = {
      clips: [
        {
          start_word_index: 10,
          end_word_index: 80,
          title: 'Great Hook Moment',
          hook: 'You won\'t believe this',
          hook_score: 8.5,
          strategic_rank: 1,
          rationale: 'Strong hook moment',
        },
        {
          start_word_index: 100,
          end_word_index: 170,
          title: 'Emotional Peak',
          hook: 'This changed everything',
          hook_score: 7.2,
          strategic_rank: 2,
          rationale: 'Emotional peak',
        },
      ],
    };

    __mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [{
          content: {
            parts: [{ text: JSON.stringify(mockClips) }],
          },
        }],
      },
    });

    const { analyzeClips } = require('../services/geminiAnalyzer');

    const result = await analyzeClips({
      words,
      videoDurationSeconds: 120,
      script: null,
      gcsUri: 'gs://test-bucket/test-video.mp4',
    });

    expect(result).toHaveLength(2);
    expect(result[0].hook_score).toBe(8.5);
    expect(result[0].strategic_rank).toBe(1);
    expect(result[0].start_word_index).toBe(10);
    expect(result[0].title).toBe('Great Hook Moment');
    expect(result[1].start_word_index).toBe(100);

    // Verify multimodal input was sent (video file + text)
    const callArgs = __mockGenerateContent.mock.calls[0][0];
    const parts = callArgs.contents[0].parts;
    expect(parts[0].fileData).toBeDefined();
    expect(parts[0].fileData.fileUri).toBe('gs://test-bucket/test-video.mp4');
    expect(parts[1].text).toBeDefined();
  });

  test('rejects clips with invalid word indices (start >= end)', async () => {
    const words = makeWords(200);
    const mockClips = {
      clips: [{
        start_word_index: 80,
        end_word_index: 30,
        title: 'Test',
        hook: 'Test hook',
        hook_score: 8.0,
        strategic_rank: 1,
        rationale: 'Test',
      }],
    };

    jest.resetModules();
    jest.mock('@google-cloud/vertexai', () => {
      return {
        VertexAI: jest.fn().mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
              response: {
                candidates: [{
                  content: {
                    parts: [{ text: JSON.stringify(mockClips) }],
                  },
                }],
              },
            }),
          }),
        })),
      };
    });

    const { analyzeClips: analyzeClips2 } = require('../services/geminiAnalyzer');

    await expect(analyzeClips2({
      words,
      videoDurationSeconds: 120,
      script: null,
      gcsUri: 'gs://test-bucket/test-video.mp4',
    })).rejects.toThrow('Invalid word indices');
  });

  test('rejects clips with too few words', async () => {
    const words = makeWords(200);
    const mockClips = {
      clips: [{
        start_word_index: 10,
        end_word_index: 30,
        title: 'Test',
        hook: 'Test hook',
        hook_score: 8.0,
        strategic_rank: 1,
        rationale: 'Test',
      }],
    };

    jest.resetModules();
    jest.mock('@google-cloud/vertexai', () => {
      return {
        VertexAI: jest.fn().mockImplementation(() => ({
          getGenerativeModel: jest.fn().mockReturnValue({
            generateContent: jest.fn().mockResolvedValue({
              response: {
                candidates: [{
                  content: {
                    parts: [{ text: JSON.stringify(mockClips) }],
                  },
                }],
              },
            }),
          }),
        })),
      };
    });

    const { analyzeClips: analyzeClips3 } = require('../services/geminiAnalyzer');

    await expect(analyzeClips3({
      words,
      videoDurationSeconds: 120,
      script: null,
      gcsUri: 'gs://test-bucket/test-video.mp4',
    })).rejects.toThrow('Clip too short');
  });
});
