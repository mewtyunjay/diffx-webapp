type QuizGenerationInput = {
  questionCount: number;
  commitMessage: string;
  focusFiles: string[];
  promptContext: string;
};

type QuizGeneratorProvider = {
  generateQuiz: (input: QuizGenerationInput) => Promise<unknown>;
};

function toSnippet(context: string): string | null {
  const trimmed = context.trim();
  if (!trimmed) {
    return null;
  }

  const lines = trimmed.split("\n").slice(0, 10);
  return lines.join("\n");
}

class MockCodexSdkProvider implements QuizGeneratorProvider {
  async generateQuiz(input: QuizGenerationInput): Promise<unknown> {
    const focusFiles = input.focusFiles.length > 0 ? input.focusFiles : ["selected changes"];
    const snippet = toSnippet(input.promptContext);

    const questions = Array.from({ length: input.questionCount }, (_, index) => {
      const file = focusFiles[index % focusFiles.length];
      const correctOptionIndex = index % 4;

      const options = [
        "To improve readability and maintainability.",
        "To add capability required by the current task.",
        "To remove obsolete behavior and reduce risk.",
        "To align behavior with existing contract expectations.",
      ] as const;

      return {
        id: `q-${index + 1}`,
        prompt: `What is the most likely reason this change was made in ${file}?`,
        snippet,
        options,
        correctOptionIndex,
        explanation:
          "Choose the option that best matches the intent reflected by the diff and commit context.",
        tags: ["intent", "review"],
      };
    });

    return {
      title: input.commitMessage
        ? `Commit readiness quiz: ${input.commitMessage}`
        : "Commit readiness quiz",
      generatedAt: new Date().toISOString(),
      questions,
    };
  }
}

let provider: QuizGeneratorProvider | null = null;

export function getQuizGeneratorProvider(): QuizGeneratorProvider {
  if (!provider) {
    provider = new MockCodexSdkProvider();
  }

  return provider;
}

export type { QuizGenerationInput, QuizGeneratorProvider };
