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

describe('Gemini Analyzer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('analyzeClips returns parsed clips from Gemini response', async () => {
    const mockClips = {
      clips: [
        {
          start_time: 10.5,
          end_time: 35.2,
          hook_score: 8.5,
          strategic_rank: 1,
          rationale: 'Strong hook moment',
        },
        {
          start_time: 60.0,
          end_time: 85.0,
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
      transcription: 'This is a test transcription...',
      shotTimestamps: [{ startTime: 0, endTime: 10 }, { startTime: 10, endTime: 30 }],
      videoDurationSeconds: 120,
      script: null,
    });

    expect(result).toHaveLength(2);
    expect(result[0].hook_score).toBe(8.5);
    expect(result[0].strategic_rank).toBe(1);
    expect(result[1].start_time).toBe(60.0);
  });

  test('rejects clips with invalid timestamps (start >= end)', async () => {
    const mockClips = {
      clips: [{
        start_time: 50.0,
        end_time: 30.0,
        hook_score: 8.0,
        strategic_rank: 1,
        rationale: 'Test',
      }],
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

    // Need to re-require to get fresh module after mock reset
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
      transcription: 'Test',
      shotTimestamps: [],
      videoDurationSeconds: 120,
      script: null,
    })).rejects.toThrow('Invalid timestamps');
  });

  test('rejects clips shorter than 5 seconds', async () => {
    const mockClips = {
      clips: [{
        start_time: 10.0,
        end_time: 13.0,
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
      transcription: 'Test',
      shotTimestamps: [],
      videoDurationSeconds: 120,
      script: null,
    })).rejects.toThrow('Clip too short');
  });
});
