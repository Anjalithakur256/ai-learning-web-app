/**
 * PHASE 3: Database Service
 * Firestore abstraction layer with logging and error handling
 * Layer: Data Access / Layer 5
 */

import { db } from "../db.js"; // Existing Firebase setup
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js";
import logger from "./logger.js";
import { errorHandler } from "./error-handler.js";

class DatabaseService {
  /**
   * Collections interface - standard CRUD operations
   */

  // ====== User Collection ======
  async createUser(userId, userData) {
    const metricKey = `db_createUser_${userId}`;
    logger.startMetric(metricKey);

    try {
      const userRef = doc(db, "users", userId);
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      logger.endMetric(metricKey, { operation: "CREATE", collection: "users" });
      logger.trackDbOperation("users", "CREATE", { userId });
      return { success: true, data: { userId, ...userData } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "createUser");
    }
  }

  async getUser(userId) {
    const metricKey = `db_getUser_${userId}`;
    logger.startMetric(metricKey);

    try {
      const userRef = doc(db, "users", userId);
      const userSnap = await getDoc(userRef);

      logger.endMetric(metricKey, { operation: "READ", collection: "users" });
      logger.trackDbOperation("users", "READ", { userId, found: userSnap.exists() });
      return { success: true, data: userSnap.data() };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "getUser");
    }
  }

  async updateUser(userId, updates) {
    const metricKey = `db_updateUser_${userId}`;
    logger.startMetric(metricKey);

    try {
      const userRef = doc(db, "users", userId);
      await updateDoc(userRef, {
        ...updates,
        updatedAt: serverTimestamp()
      });

      logger.endMetric(metricKey, { operation: "UPDATE", collection: "users" });
      logger.trackDbOperation("users", "UPDATE", { userId, fields: Object.keys(updates) });
      return { success: true };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "updateUser");
    }
  }

  // ====== SkillMastery Collection ======
  async initializeMastery(userId, topicId) {
    const metricKey = `db_initializeMastery_${userId}_${topicId}`;
    logger.startMetric(metricKey);

    try {
      const masteryRef = doc(db, `users/${userId}/SkillMastery`, topicId);
      await setDoc(masteryRef, {
        userId,
        topicId,
        masteryLevel: 0,
        averageScore: 0,
        currentStreak: 0,
        attemptCount: 0,
        attemptHistory: [],
        initializationDate: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });

      logger.endMetric(metricKey, { operation: "INIT_MASTERY", collection: "SkillMastery" });
      logger.info("DATABASE", `Mastery initialized for ${userId} in ${topicId}`);
      return { success: true };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "initializeMastery");
    }
  }

  async updateMastery(userId, topicId, score) {
    const metricKey = `db_updateMastery_${userId}_${topicId}`;
    logger.startMetric(metricKey);

    try {
      const masteryRef = doc(db, `users/${userId}/SkillMastery`, topicId);
      const masterySnap = await getDoc(masteryRef);

      if (!masterySnap.exists()) {
        await this.initializeMastery(userId, topicId);
      }

      const currentData = masterySnap.data() || {};
      const isSuccess = score >= 70;
      const adjustment = isSuccess ? 10 : -5;
      const newLevel = Math.max(0, Math.min(100, (currentData.masteryLevel || 0) + adjustment));

      await updateDoc(masteryRef, {
        masteryLevel: newLevel,
        averageScore: ((currentData.averageScore || 0) * (currentData.attemptCount || 0) + score) /
          ((currentData.attemptCount || 0) + 1),
        currentStreak: isSuccess ? (currentData.currentStreak || 0) + 1 : 0,
        attemptCount: (currentData.attemptCount || 0) + 1,
        attemptHistory: arrayUnion({ score, date: serverTimestamp(), adjustment }),
        lastUpdated: serverTimestamp()
      });

      logger.endMetric(metricKey, {
        operation: "UPDATE_MASTERY",
        score,
        adjustment,
        newLevel
      });
      logger.info("DATABASE", `Mastery updated for ${userId}/${topicId}`, {
        score,
        newLevel,
        adjustment
      });
      return { success: true, data: { masteryLevel: newLevel } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "updateMastery");
    }
  }

  async getMastery(userId, topicId) {
    const metricKey = `db_getMastery_${userId}_${topicId}`;
    logger.startMetric(metricKey);

    try {
      const masteryRef = doc(db, `users/${userId}/SkillMastery`, topicId);
      const masterySnap = await getDoc(masteryRef);

      logger.endMetric(metricKey, { operation: "READ_MASTERY", collection: "SkillMastery" });
      return {
        success: true,
        data: masterySnap.data() || { masteryLevel: 0 }
      };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "getMastery");
    }
  }

  // ====== Conversations Collection ======
  async createConversation(userId, topicId, metadata = {}) {
    const metricKey = `db_createConversation_${userId}`;
    logger.startMetric(metricKey);

    try {
      const conversationRef = doc(collection(db, "conversations"));
      await setDoc(conversationRef, {
        userId,
        topicId,
        messageCount: 0,
        startedAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        ...metadata
      });

      logger.endMetric(metricKey, {
        operation: "CREATE_CONVERSATION",
        conversationId: conversationRef.id
      });
      logger.info("DATABASE", `Conversation created: ${conversationRef.id}`);
      return { success: true, data: { conversationId: conversationRef.id } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "createConversation");
    }
  }

  async addMessage(conversationId, messageData) {
    const metricKey = `db_addMessage_${conversationId}`;
    logger.startMetric(metricKey);

    try {
      const messageRef = doc(collection(db, `conversations/${conversationId}/messages`));
      await setDoc(messageRef, {
        ...messageData,
        createdAt: serverTimestamp()
      });

      // Update conversation metadata
      await updateDoc(doc(db, "conversations", conversationId), {
        messageCount: messageData.messageCount || 1,
        lastMessageAt: serverTimestamp()
      });

      logger.endMetric(metricKey, { operation: "ADD_MESSAGE", messageId: messageRef.id });
      logger.trackDbOperation("messages", "CREATE", {
        conversationId,
        role: messageData.role
      });
      return { success: true, data: { messageId: messageRef.id } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "addMessage");
    }
  }

  async getConversationMessages(conversationId, limit = 50) {
    const metricKey = `db_getMessages_${conversationId}`;
    logger.startMetric(metricKey);

    try {
      const messagesRef = collection(db, `conversations/${conversationId}/messages`);
      const q = query(messagesRef);
      const snapshot = await getDocs(q);

      const messages = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .slice(-limit);

      logger.endMetric(metricKey, {
        operation: "READ_MESSAGES",
        count: messages.length
      });
      logger.trackDbOperation("messages", "READ", { conversationId, count: messages.length });
      return { success: true, data: messages };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "getConversationMessages");
    }
  }

  // ====== Documents & Chunks (RAG) ======
  async createChunk(chunkData) {
    const metricKey = `db_createChunk`;
    logger.startMetric(metricKey);

    try {
      const chunksRef = collection(db, "chunks");
      const chunkRef = doc(chunksRef);
      await setDoc(chunkRef, {
        ...chunkData,
        createdAt: serverTimestamp()
      });

      logger.endMetric(metricKey, { operation: "CREATE_CHUNK", chunkId: chunkRef.id });
      return { success: true, data: { chunkId: chunkRef.id } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "createChunk");
    }
  }

  async getChunksByTopic(topicId, limit = 100) {
    const metricKey = `db_getChunks_${topicId}`;
    logger.startMetric(metricKey);

    try {
      const chunksRef = collection(db, "chunks");
      const q = query(chunksRef, where("topicId", "==", topicId));
      const snapshot = await getDocs(q);

      const chunks = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .slice(0, limit);

      logger.endMetric(metricKey, {
        operation: "READ_CHUNKS",
        count: chunks.length,
        topicId
      });
      return { success: true, data: chunks };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "getChunksByTopic");
    }
  }

  // ====== Batch Operations ======
  async batchWrite(operations) {
    const metricKey = `db_batchWrite`;
    logger.startMetric(metricKey);

    try {
      const batch = writeBatch(db);
      let operationCount = 0;

      for (const op of operations) {
        const ref = doc(db, op.path);
        if (op.type === "SET") {
          batch.set(ref, op.data);
        } else if (op.type === "UPDATE") {
          batch.update(ref, op.data);
        } else if (op.type === "DELETE") {
          batch.delete(ref);
        }
        operationCount++;
      }

      await batch.commit();
      logger.endMetric(metricKey, { operation: "BATCH_WRITE", count: operationCount });
      logger.info("DATABASE", `Batch write completed: ${operationCount} operations`);
      return { success: true, data: { operationsCount: operationCount } };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "batchWrite");
    }
  }

  /**
   * Utility: Get full user profile
   */
  async getUserProfile(userId) {
    try {
      const user = await this.getUser(userId);
      // Additional profile data can be loaded here
      return { success: true, data: user.data };
    } catch (error) {
      return errorHandler.handleDatabaseError(error, "getUserProfile");
    }
  }
}

// Export singleton
export const databaseService = new DatabaseService();
export default databaseService;
