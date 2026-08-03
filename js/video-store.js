const DB_NAME = "kintore-form-videos";
const STORE_NAME = "videos";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transaction(mode, action) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const request = action(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  }));
}

export function getExerciseVideo(exerciseId) {
  return transaction("readonly", store => store.get(exerciseId));
}

export function saveExerciseVideo(exerciseId, file) {
  return transaction("readwrite", store => store.put(file, exerciseId));
}

export function deleteExerciseVideo(exerciseId) {
  return transaction("readwrite", store => store.delete(exerciseId));
}

export function clearExerciseVideos() {
  return transaction("readwrite", store => store.clear());
}
