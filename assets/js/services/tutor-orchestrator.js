/**
 * PHASE 3: Tutor Orchestrator Service
 * Manages Socratic dialogue flow and adaptive tutoring
 * Layer: Tutor Orchestrator / Layer 2
 */

import { getConfig } from "./config.js";
import logger from "./logger.js";
import { databaseService } from "./database-service.js";
import { aiInferenceService } from "./ai-inference-service.js";
import { ragEngineService } from "./rag-engine.js";

class TutorOrchestratorService {
  constructor() {
    this.stages = getConfig("SOCRATIC.STAGES");
    this.initialStage = getConfig("SOCRATIC.INITIAL_STAGE");
  }

  /**
   * Master orchestration: Query → RAG → Socratic → AI → Response
   */
  async processTutorQuery(userQuery, userId, topicId, currentStage = 0, masteryLevel = 0, learningStyle = "Socratic") {
    const metricKey = `tutor_query_${Date.now()}`;
    logger.startMetric(metricKey);

    try {
      logger.info("TUTOR", "Processing tutor query", {
        userId,
        topicId,
        currentStage,
        masteryLevel,
        queryLength: userQuery.length
      });

      // Step 1: Execute RAG pipeline
      logger.debug("TUTOR", "Step 1: Executing RAG pipeline");
      const ragResult = await ragEngineService.executeRagPipeline(userQuery, topicId);

      const ragContext = ragResult.success ? ragResult.data.context : "";
      const sourceChunks = ragResult.success ? ragResult.data.chunks : [];

      // Step 2: Build prompt (style-aware)
      logger.debug("TUTOR", "Step 2: Building prompt", { learningStyle });
      const prompt = this._buildSocraticPrompt(
        userQuery,
        ragContext,
        masteryLevel,
        currentStage,
        learningStyle
      );

      // Step 3: Generate response via AI
      logger.debug("TUTOR", "Step 3: Calling AI inference");
      const aiResult = await aiInferenceService.generateContent(prompt, "", {
        maxTokens: 512,
        temperature: 0.7
      });

      if (!aiResult.success) {
        throw new Error(
          `AI generation failed: ${aiResult.error?.message || "Unknown error"}`
        );
      }

      const response = aiResult.data.text;

      // Step 4: Determine next stage
      logger.debug("TUTOR", "Step 4: Determining next Socratic stage");
      const nextStage = this._determineNextStage(userQuery, response, currentStage);

      // Step 5: Log to database
      logger.debug("TUTOR", "Step 5: Logging conversation to database");
      // Will be called by higher-level service

      const duration = logger.endMetric(metricKey, {
        currentStage: this._getStageName(currentStage),
        nextStage: this._getStageName(nextStage),
        sourceChunks: sourceChunks.length,
        responseTokens: aiResult.data.tokens
      });

      logger.info("TUTOR", "Tutor query processed successfully", {
        stageName: this._getStageName(currentStage),
        nextStageName: this._getStageName(nextStage),
        sourceChunks: sourceChunks.length,
        duration
      });

      return {
        success: true,
        data: {
          response,
          nextStage,
          sourceChunks,
          metadata: {
            currentStage,
            masteryLevel,
            queryLength: userQuery.length,
            responseLength: response.length,
            ragContextUsed: ragContext.length > 0,
            sourceCount: sourceChunks.length
          }
        }
      };
    } catch (error) {
      logger.endMetric(metricKey);
      logger.error("TUTOR", "Tutor query processing failed", {}, error);
      return {
        success: false,
        error: error.message,
        data: {
          response: "An error occurred. Please try again.",
          nextStage: currentStage,
          sourceChunks: [],
          metadata: {}
        }
      };
    }
  }

  /**
   * Build prompt with Socratic guidance
   */
  _buildSocraticPrompt(query, ragContext, masteryLevel, stage, learningStyle = "Socratic") {
    const stageName = this._getStageName(stage);
    const masteryLabel = this._getMasteryLabel(masteryLevel);

    const masteryAdaptation = {
      Beginner: "Beginner - Use simpler language, more examples, shorter explanations",
      Intermediate: "Intermediate - Balance guidance and challenge, use clear explanations",
      Advanced: "Advanced - Assume some knowledge, encourage deeper thinking",
      Expert: "Expert - Focus on nuance, extensions, and connections to other concepts"
    };

    const ragSection = ragContext
      ? `REFERENCE MATERIAL:\n${ragContext}\n\nDraw on this material when relevant.`
      : "";

    // ── Style-specific prompt templates ──────────────────────────────────────
    if (learningStyle === "Explanatory") {
      return `You are an expert AI tutor who gives thorough, detailed explanations.

STUDENT MASTERY LEVEL: ${masteryLabel}
${masteryAdaptation[masteryLabel]}

Your role: Provide a complete, well-structured explanation. Cover the concept with context,
background, and a step-by-step breakdown. Use headers or bullet points where they add clarity.
Do not withhold information — the student learns best from detailed, complete answers.

${ragSection}

STUDENT QUERY:
${query}

Give a comprehensive, well-organised response that covers the topic thoroughly.`;
    }

    if (learningStyle === "Concise") {
      return `You are an expert AI tutor who gives short, sharp, direct answers.

STUDENT MASTERY LEVEL: ${masteryLabel}
${masteryAdaptation[masteryLabel]}

Your role: Answer directly and concisely — no filler, no lengthy preamble. Get to the point
immediately. Use 2–4 sentences unless the question genuinely requires more detail.
If a follow-up is needed, ask ONE focused question.

${ragSection}

STUDENT QUERY:
${query}

Respond as briefly and precisely as possible.`;
    }

    // Default: Socratic (Question-Answer) ─────────────────────────────────────
    const stageInstructions = {
      CLARIFY: `Your role: Ask clarifying questions first. Do NOT provide the answer yet.
               Help the student understand what they're being asked.
               Ask specific follow-up questions to assess their current understanding.`,

      HINT: `Your role: Provide a hint or nudge in the right direction.
             Offer an analogy or example, but do NOT give the complete answer.
             Ask a leading question to guide them toward the solution.`,

      GUIDE: `Your role: Break the problem into steps and ask leading questions.
              Walk through the reasoning process with the student.
              Have them fill in the key insights themselves before summarising.`,

      VERIFY: `Your role: Ask the student to explain their reasoning back to you.
               This helps confirm understanding. Point out any gaps gently.
               Guide them to correct any misunderstandings.`,

      EXPLAIN: `Your role: Provide the complete, step-by-step explanation.
                Now that they've engaged with the problem, give the full answer.
                Summarise the key concepts and how they fit together.`
    };

    return `You are an expert Socratic tutor using the ${stageName} approach.

STUDENT MASTERY LEVEL: ${masteryLabel}
${masteryAdaptation[masteryLabel]}

CURRENT STAGE: ${stageName}
${stageInstructions[stageName]}

${ragSection}

STUDENT QUERY:
${query}

Respond in a way that is appropriate for the ${stageName} stage of the Socratic method.
Be encouraging, clear, and help the student learn by discovery rather than direct answers.`;
  }

  /**
   * Determine next Socratic stage based on response quality
   */
  _determineNextStage(userQuery, aiResponse, currentStage) {
    // Analyze user query and AI response to decide if we should advance

    const queryLength = userQuery.length;
    const hasUncertainty =
      /\b(don't know|not sure|confused|unclear|help|don't understand)\b/i.test(userQuery);
    const hasMultipleQuestions = (userQuery.match(/\?/g) || []).length > 2;

    // If student is confused, go back to HINT
    if (hasUncertainty && currentStage > this.stages.HINT) {
      logger.debug("TUTOR", "Student shows confusion, reverting to HINT stage");
      return this.stages.HINT;
    }

    // If student provides good attempt, advance
    if (queryLength > 50 && !hasUncertainty && currentStage < this.stages.EXPLAIN) {
      logger.debug("TUTOR", "Good student response, advancing stage");
      return currentStage + 1;
    }

    // If student asks many questions, stay in GUIDE
    if (hasMultipleQuestions && currentStage < this.stages.GUIDE) {
      return this.stages.GUIDE;
    }

    // Default: stay or slowly progress
    return currentStage < this.stages.EXPLAIN ? currentStage + 1 : this.stages.EXPLAIN;
  }

  /**
   * Get stage name from number
   */
  _getStageName(stageNum) {
    const names = ["CLARIFY", "HINT", "GUIDE", "VERIFY", "EXPLAIN"];
    return names[stageNum] || "EXPLAIN";
  }

  /**
   * Get mastery level label
   */
  _getMasteryLabel(level) {
    if (level < 25) return "Beginner";
    if (level < 50) return "Intermediate";
    if (level < 75) return "Advanced";
    return "Expert";
  }

  /**
   * Start new tutoring session
   */
  async startSession(userId, topicId) {
    logger.info("TUTOR", "Starting new tutoring session", { userId, topicId });

    // Get user mastery level
    const masteryResult = await databaseService.getMastery(userId, topicId);
    const masteryLevel = masteryResult.success ? masteryResult.data.masteryLevel : 0;

    // Create conversation
    const conversationResult = await databaseService.createConversation(
      userId,
      topicId,
      {
        initialMastery: masteryLevel,
        initialStage: this.initialStage
      }
    );

    if (!conversationResult.success) {
      throw new Error("Failed to create conversation session");
    }

    logger.info("TUTOR", "Session started", {
      conversationId: conversationResult.data.conversationId,
      masteryLevel
    });

    return {
      sessionId: conversationResult.data.conversationId,
      masteryLevel,
      initialStage: this.initialStage,
      initialMessage: this._getSessionOpeningMessage(masteryLevel)
    };
  }

  /**
   * Get opening message based on mastery level
   */
  _getSessionOpeningMessage(masteryLevel) {
    const masteryLabel = this._getMasteryLabel(masteryLevel);

    const messages = {
      Beginner: "Hello! I'm your AI tutor. Let's work through this together. What would you like to learn about?",
      Intermediate: "Welcome back! Ready to deepen your understanding? What topic would you like to explore?",
      Advanced: "Great to have you here! Let's tackle some advanced concepts. What interests you?",
      Expert: "Excellent! Let's discuss some nuanced ideas. What's on your mind?"
    };

    return messages[masteryLabel];
  }
}

// Export singleton
export const tutorOrchestratorService = new TutorOrchestratorService();
export default tutorOrchestratorService;
