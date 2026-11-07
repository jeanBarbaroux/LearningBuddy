import type { ImportedPackage } from '../core/types';

export function samplePackage(title = 'AZ-900', count = 2): ImportedPackage {
  return {
    title,
    cards: Array.from({ length: count }, (_, index) => ({
      type: 'card' as const,
      question: `Question ${index}`,
      answer: `Réponse ${index}`,
      explanation: null,
      language: 'fr',
      tags: [],
      choices: [],
      image: null,
      answerImage: null,
    })),
  };
}
