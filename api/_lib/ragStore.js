// Firestore-backed vector store for study documents.
//
// Layout (all writes/reads via Admin SDK, so security rules stay closed):
//   studyDocuments/{docId}                     -> metadata
//   studyDocuments/{docId}/shards/{shardId}    -> { items: [{ index, text, embedding }] }
//
// Chunks are packed into shards to keep per-query Firestore reads low, which
// matters on the free Spark plan.

import { getAdmin } from "./firebaseAdmin.js";

const SHARD_SIZE = 20; // chunks per shard doc
const FIRESTORE_BATCH_LIMIT = 400; // stay under the 500-op ceiling

/**
 * Persists a document's chunks + embeddings and its metadata. When examId is
 * provided, stamps the exam with studyDocumentId so unauthenticated students
 * can discover it via the (publicly readable) active exam.
 */
export async function storeDocument(db, meta, chunks, embeddings) {
  if (chunks.length !== embeddings.length) {
    throw new Error("Chunk and embedding counts do not match.");
  }
  const admin = getAdmin();
  const docRef = db.collection("studyDocuments").doc();

  const shards = [];
  for (let start = 0; start < chunks.length; start += SHARD_SIZE) {
    const items = [];
    for (let i = start; i < Math.min(start + SHARD_SIZE, chunks.length); i += 1) {
      items.push({ index: i, text: chunks[i], embedding: embeddings[i] });
    }
    shards.push(items);
  }

  const charCount = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

  // Write shards (batched), then metadata + exam stamp.
  for (let start = 0; start < shards.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const items of shards.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
      batch.set(docRef.collection("shards").doc(), {
        items,
        from: items[0].index,
        to: items[items.length - 1].index,
      });
    }
    await batch.commit();
  }

  await docRef.set({
    title: meta.title,
    subject: meta.subject ?? "",
    examId: meta.examId ?? "",
    source: meta.source ?? "upload",
    chunkCount: chunks.length,
    charCount,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  if (meta.examId) {
    await db.collection("exams").doc(meta.examId).set(
      {
        studyDocumentId: docRef.id,
        studyDocumentTitle: meta.title,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }

  return { id: docRef.id, chunkCount: chunks.length, charCount };
}

/** Loads every chunk (with embedding) for a document, ordered by index. */
export async function loadChunks(db, docId) {
  const snapshot = await db
    .collection("studyDocuments")
    .doc(docId)
    .collection("shards")
    .get();

  const items = [];
  snapshot.forEach((shard) => {
    const shardItems = shard.get("items") || [];
    for (const item of shardItems) {
      items.push(item);
    }
  });
  items.sort((a, b) => a.index - b.index);
  return items;
}

/** Concatenates chunk text (ordered) up to maxChars — used for generation. */
export async function loadText(db, docId, maxChars = 40000) {
  const items = await loadChunks(db, docId);
  let text = "";
  for (const item of items) {
    if (text.length + item.text.length > maxChars) {
      break;
    }
    text += item.text + "\n\n";
  }
  return text.trim();
}

export async function getDocumentMeta(db, docId) {
  const doc = await db.collection("studyDocuments").doc(docId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

/** Resolves the study document linked to an exam, if the exam is active. */
export async function resolveDocumentForExam(db, examId) {
  const examDoc = await db.collection("exams").doc(examId).get();
  if (!examDoc.exists || examDoc.get("isActive") !== true) {
    return null;
  }
  const docId = examDoc.get("studyDocumentId");
  if (!docId) {
    return null;
  }
  return getDocumentMeta(db, docId);
}

/** Deletes a document, its shards, and clears the exam stamp. */
export async function deleteDocument(db, docId) {
  const docRef = db.collection("studyDocuments").doc(docId);
  const meta = await docRef.get();
  if (!meta.exists) {
    return;
  }

  const shards = await docRef.collection("shards").get();
  for (let start = 0; start < shards.docs.length; start += FIRESTORE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const shard of shards.docs.slice(start, start + FIRESTORE_BATCH_LIMIT)) {
      batch.delete(shard.ref);
    }
    await batch.commit();
  }

  const examId = meta.get("examId");
  if (examId) {
    const admin = getAdmin();
    await db.collection("exams").doc(examId).set(
      {
        studyDocumentId: admin.firestore.FieldValue.delete(),
        studyDocumentTitle: admin.firestore.FieldValue.delete(),
      },
      { merge: true },
    );
  }

  await docRef.delete();
}
