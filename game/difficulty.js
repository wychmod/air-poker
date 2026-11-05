export const DIFFICULTY_IDS = Object.freeze(['beginner', 'medium', 'hard']);
export const DEFAULT_DIFFICULTY = 'medium';

export const isDifficultyId = (value) => DIFFICULTY_IDS.includes(value);
export const normalizeDifficulty = (value) => (isDifficultyId(value) ? value : DEFAULT_DIFFICULTY);

const policies = Object.freeze({
  beginner: Object.freeze({
    id: 'beginner',
    candidateLimit: 3,
    planningDepth: 0,
    beamWidth: 0,
    maxCandidateCalls: 256,
    riskWeight: 0.35,
    betTolerance: 0.2,
    playTolerance: 0.2,
    adaptive: false,
  }),
  medium: Object.freeze({
    id: 'medium',
    candidateLimit: 12,
    planningDepth: 1,
    beamWidth: 0,
    maxCandidateCalls: 256,
    riskWeight: 0.12,
    betTolerance: 0.1,
    playTolerance: 0,
    adaptive: false,
  }),
  hard: Object.freeze({
    id: 'hard',
    candidateLimit: 12,
    planningDepth: 2,
    beamWidth: 4,
    maxCandidateCalls: 256,
    riskWeight: 0.16,
    betTolerance: 0.05,
    playTolerance: 0,
    adaptive: true,
  }),
});

export const difficultyPolicy = (id) => policies[normalizeDifficulty(id)];
