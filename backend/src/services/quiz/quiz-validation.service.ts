import type {
  QuizPayload,
  QuizSettings,
  QuizValidationMode,
  QuizValidationResult,
} from "@diffx/contracts";
import { ApiRouteError } from "../../domain/api-route-error.js";

function toInvalidAnswerError(message: string): ApiRouteError {
  return new ApiRouteError(400, "INVALID_QUIZ_ANSWER", message);
}

function isAnswerIndex(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3;
}

export function normalizeQuizAnswers(
  quiz: QuizPayload,
  answers: Record<string, number>,
): Record<string, number> {
  const questionIds = new Set(quiz.questions.map((question) => question.id));
  const normalized: Record<string, number> = {};

  for (const [questionId, value] of Object.entries(answers)) {
    if (!questionIds.has(questionId)) {
      throw toInvalidAnswerError(`Unknown question id '${questionId}'.`);
    }

    if (!isAnswerIndex(value)) {
      throw toInvalidAnswerError(
        `Answer for '${questionId}' must be an integer between 0 and 3.`,
      );
    }

    normalized[questionId] = value;
  }

  return normalized;
}

function didPassValidation(
  mode: QuizValidationMode,
  answeredCount: number,
  correctCount: number,
  totalQuestions: number,
  scoreThreshold: number | null,
): boolean {
  if (mode === "answer_all") {
    return answeredCount === totalQuestions;
  }

  if (mode === "pass_all") {
    return answeredCount === totalQuestions && correctCount === totalQuestions;
  }

  return answeredCount === totalQuestions && correctCount >= (scoreThreshold ?? totalQuestions);
}

export function evaluateQuizValidation(
  quiz: QuizPayload,
  answers: Record<string, number>,
  settings: QuizSettings,
): QuizValidationResult {
  const normalizedAnswers = normalizeQuizAnswers(quiz, answers);
  const totalQuestions = quiz.questions.length;

  const answeredCount = quiz.questions.reduce((count, question) => {
    return normalizedAnswers[question.id] === undefined ? count : count + 1;
  }, 0);

  const correctCount = quiz.questions.reduce((count, question) => {
    if (normalizedAnswers[question.id] === question.correctOptionIndex) {
      return count + 1;
    }

    return count;
  }, 0);

  const score = totalQuestions === 0 ? 0 : Number((correctCount / totalQuestions).toFixed(4));
  const scoreThreshold = settings.validationMode === "score_threshold" ? settings.scoreThreshold : null;

  return {
    mode: settings.validationMode,
    passed: didPassValidation(
      settings.validationMode,
      answeredCount,
      correctCount,
      totalQuestions,
      scoreThreshold,
    ),
    answeredCount,
    correctCount,
    totalQuestions,
    score,
    scoreThreshold,
  };
}
