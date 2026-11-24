import type { NextFunction, Request, Response } from 'express';
import { dialogueEngine } from '../ai/deterministicDialogueEngine.js';
import { withDefaultWording } from '../ai/questionnaireContent.js';
import { speechService } from '../ai/speech.js';
import { env } from '../config/env.js';
import { LANGUAGES, type QuestionnaireContent } from '../ai/types.js';
import { getActiveQuestionnaire } from '../services/sessionService.js';

/** Reports which conversation components are available right now. */
export async function aiHealth(_request: Request, response: Response): Promise<void> {
  const speech = await speechService.health();
  response.json({
    data: {
      dialogueEngine: { name: dialogueEngine.name, status: 'available' },
      inputModes: speech.reachable ? ['text', 'voice'] : ['text'],
      speechService: { status: speech.reachable ? 'available' : 'unavailable' },
      speechToText: speech.speechToText ?? null,
      textToSpeech: speech.textToSpeech ?? null,
      minimumSpeechConfidence: env.STT_MIN_CONFIDENCE,
      audioRetention: 'none',
      languageModel: { status: 'not_configured' },
    },
  });
}

export async function aiConfig(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const questionnaire = await getActiveQuestionnaire(
      request.authUser!.organizationId,
      request.authUser!.id,
    );
    const content = withDefaultWording(questionnaire.languageContent as QuestionnaireContent);
    response.json({
      data: {
        questionnaireVersion: questionnaire.version,
        supportedLanguages: LANGUAGES,
        defaultLanguage: content.defaultLanguage,
        maxClarificationAttempts: content.maxClarificationAttempts,
        languages: content.languages,
      },
    });
  } catch (error) {
    next(error);
  }
}
