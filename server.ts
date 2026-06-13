import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

// Set high request body size limits to accommodate high-resolution poster base64 uploads
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const postersDir = path.join(process.cwd(), "public", "posters");
const postersJsonPath = path.join(postersDir, "posters.json");
const deletedJsonPath = path.join(postersDir, "deleted_ids.json");

// Ensure the posters storage directory exists on the system
if (!fs.existsSync(postersDir)) {
  fs.mkdirSync(postersDir, { recursive: true });
}

// Helpers for deleted IDs to avoid resurrected items from client cache/sync
function getDeletedIds(): string[] {
  try {
    if (fs.existsSync(deletedJsonPath)) {
      const raw = fs.readFileSync(deletedJsonPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading deleted ids:", err);
  }
  return [];
}

function saveDeletedId(id: string) {
  try {
    const ids = getDeletedIds();
    if (!ids.includes(id)) {
      ids.push(id);
      fs.writeFileSync(deletedJsonPath, JSON.stringify(ids, null, 2), "utf-8");
    }
  } catch (err) {
    console.error("Error saving deleted id:", err);
  }
}

// Default initial seeded design posters (set to empty array for initial state)
const defaultPosters: any[] = [];

// Helper to write database (as JSON format) to disk
function savePostersData(data: any) {
  try {
    fs.writeFileSync(postersJsonPath, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing posters metadata json file:", err);
  }
}

// Helper to read database
function getPostersData() {
  try {
    if (fs.existsSync(postersJsonPath)) {
      const raw = fs.readFileSync(postersJsonPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error("Error reading posters metadata, recreating default DB:", err);
  }
  // Initialize with default posters
  savePostersData(defaultPosters);
  return defaultPosters;
}

// Ensure database file exist on load
if (!fs.existsSync(postersJsonPath)) {
  savePostersData(defaultPosters);
}

// Always statically serve '/posters' path pointing to our persistent directory
// This guarantees newly uploaded images after build will load correctly
app.use("/posters", express.static(postersDir));

// --- API Router Enpoints ---

// Get all posters
app.get("/api/posters", (req, res) => {
  res.json(getPostersData());
});

// Create new poster
app.post("/api/posters", (req, res) => {
  const { title, tag, image, objectFit } = req.body;

  if (!title || !image) {
    return res.status(400).json({ error: "Missing title or image parameters." });
  }

  const id = `poster-${Date.now()}`;
  let imagePath = image;

  // Process and convert base64 payload to web server local image file
  if (image.startsWith("data:image/")) {
    try {
      const mimeMatches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (mimeMatches && mimeMatches.length === 3) {
        const ext = mimeMatches[1].split("/")[1] || "jpg";
        const buffer = Buffer.from(mimeMatches[2], "base64");
        const filename = `${id}.${ext}`;
        const filePath = path.join(postersDir, filename);

        // Write file on local disk
        fs.writeFileSync(filePath, buffer);
        imagePath = `/posters/${filename}`;
      }
    } catch (err) {
      console.error("Error saving base64 image decoding on system root:", err);
      return res.status(500).json({ error: "Failed to process image attachment storage." });
    }
  }

  const newPoster = {
    id,
    title: title.toUpperCase(),
    tag: (tag || "").toUpperCase(),
    image: imagePath,
    objectFit: objectFit || "contain",
    createdAt: Date.now()
  };

  const currentDatabase = getPostersData();
  currentDatabase.push(newPoster);
  savePostersData(currentDatabase);

  res.status(201).json(newPoster);
});

// Batch Sync API: Receive posters from user's client state, restore them on server filesystem
app.post("/api/posters/sync", (req, res) => {
  const { posters } = req.body;
  if (!Array.isArray(posters)) {
    return res.status(400).json({ error: "Invalid posters format" });
  }

  const currentDatabase = getPostersData();
  const deletedIds = getDeletedIds();
  let updated = false;

  for (const clientPoster of posters) {
    if (deletedIds.includes(clientPoster.id)) {
      continue; // Skip any poster that was explicitly deleted by the user or admin
    }
    const existingIndex = currentDatabase.findIndex((item: any) => item.id === clientPoster.id);
    let targetImage = clientPoster.image;

    // Direct folder image restoration path
    if (clientPoster.image.startsWith("/posters/")) {
      const filename = clientPoster.image.replace("/posters/", "");
      const filePath = path.join(postersDir, filename);

      // If the file is missing from local disk but base64 is present locally, let's revive it
      if (!fs.existsSync(filePath) && clientPoster.localBackupImage && clientPoster.localBackupImage.startsWith("data:image/")) {
        try {
          const mimeMatches = clientPoster.localBackupImage.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (mimeMatches && mimeMatches.length === 3) {
            const buffer = Buffer.from(mimeMatches[2], "base64");
            fs.writeFileSync(filePath, buffer);
            console.log(`Successfully re-hydrated lost poster asset: ${filename}`);
          }
        } catch (e) {
          console.error(`Failed re-hydrating lost poster ${filename}:`, e);
        }
      }
    } else if (clientPoster.image.startsWith("data:image/")) {
      try {
        const mimeMatches = clientPoster.image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (mimeMatches && mimeMatches.length === 3) {
          const ext = mimeMatches[1].split("/")[1] || "jpg";
          const filename = `${clientPoster.id}.${ext}`;
          const filePath = path.join(postersDir, filename);
          const buffer = Buffer.from(mimeMatches[2], "base64");
          fs.writeFileSync(filePath, buffer);
          targetImage = `/posters/${filename}`;
        }
      } catch (e) {
        console.error("Direct image recover from base64 failed", e);
      }
    }

    if (existingIndex !== -1) {
      if (currentDatabase[existingIndex].image !== targetImage) {
        currentDatabase[existingIndex].image = targetImage;
        updated = true;
      }
    } else {
      const newPoster = {
        id: clientPoster.id,
        title: (clientPoster.title || "").toUpperCase(),
        tag: (clientPoster.tag || "").toUpperCase(),
        image: targetImage,
        objectFit: clientPoster.objectFit || "contain",
        createdAt: clientPoster.createdAt || Date.now()
      };
      currentDatabase.push(newPoster);
      updated = true;
    }
  }

  if (updated) {
    savePostersData(currentDatabase);
  }

  res.json(currentDatabase);
});

// Update poster labels (title / tag)
app.put("/api/posters/:id", (req, res) => {
  const { id } = req.params;
  const { title, tag } = req.body;

  const currentDatabase = getPostersData();
  const targetIndex = currentDatabase.findIndex((item: any) => item.id === id);

  if (targetIndex === -1) {
    return res.status(404).json({ error: "Poster item not found in DB." });
  }

  if (title) currentDatabase[targetIndex].title = title.toUpperCase();
  if (tag) currentDatabase[targetIndex].tag = tag.toUpperCase();

  savePostersData(currentDatabase);
  res.json(currentDatabase[targetIndex]);
});

// Delete a specific poster
app.delete("/api/posters/:id", (req, res) => {
  const { id } = req.params;
  let currentDatabase = getPostersData();
  const targetItem = currentDatabase.find((item: any) => item.id === id);

  if (!targetItem) {
    return res.status(404).json({ error: "Poster item not found" });
  }

  // Delete actual file from physical storage if it's placed in /posters/
  if (targetItem.image.startsWith("/posters/")) {
    const filename = targetItem.image.replace("/posters/", "");
    const filePath = path.join(postersDir, filename);
    try {
      if (fs.existsSync(filePath)) {
        // We only skip unlinking seeded files to keep sample preview working
        const isSeededFile = ["week01_chair.jpg", "week02_glass.jpg", "week03_book.jpg", "week04_pattern.jpg"].includes(filename);
        if (!isSeededFile) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (err) {
      console.error("Failed to delete physical image file:", err);
    }
  }

  currentDatabase = currentDatabase.filter((item: any) => item.id !== id);
  savePostersData(currentDatabase);
  saveDeletedId(id);

  res.json({ success: true, id });
});

// System Reset API: flush custom uploads and restore default seeds (which is now empty)
app.post("/api/posters/reset", (req, res) => {
  try {
    const files = fs.readdirSync(postersDir);
    const seededNames = ["week01_chair.jpg", "week02_glass.jpg", "week03_book.jpg", "week04_pattern.jpg", "posters.json"];
    for (const file of files) {
      if (!seededNames.includes(file)) {
        fs.unlinkSync(path.join(postersDir, file));
      }
    }
  } catch (err) {
    console.error("Reset storage flush cleanup failed:", err);
  }

  const resetData: any[] = [];
  savePostersData(resetData);
  try {
    if (fs.existsSync(deletedJsonPath)) {
      fs.writeFileSync(deletedJsonPath, "[]", "utf-8");
    }
  } catch (err) {}
  res.json(resetData);
});

// Boot the integrated Vite configuration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express Dev Server launched, binding http://0.0.0.0:${PORT}`);
  });
}

startServer();
