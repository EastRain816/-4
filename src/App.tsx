import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Upload, 
  Trash2, 
  Maximize2, 
  X, 
  Plus, 
  Image as ImageIcon,
  Check,
  RotateCcw,
  Sparkles,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

// Define the Poster Interface
interface Poster {
  id: string;
  title: string;
  tag: string;
  image: string; // Base64 or image URL
  objectFit: 'cover' | 'contain';
  createdAt: number;
  localBackupImage?: string;
}

export default function App() {
  // State for posters
  const [posters, setPosters] = useState<Poster[]>([]);

  // Form states
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTag, setNewTag] = useState('');
  const [newImage, setNewImage] = useState<string>('');
  const [newImageName, setNewImageName] = useState('');
  const [objectFit, setObjectFit] = useState<'cover' | 'contain'>('contain');
  const [urlInput, setUrlInput] = useState('');
  const [useUrl, setUseUrl] = useState(false);
  
  // Interaction/UI states
  const [dragActive, setDragActive] = useState(false);
  const [lightboxPoster, setLightboxPoster] = useState<Poster | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminMode, setAdminMode] = useState(true);

  // Editing states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTag, setEditTag] = useState('');

  // Fetch initial posters from backend and synchronize automatically with client state
  useEffect(() => {
    fetch('/api/posters')
      .then(res => {
        if (!res.ok) throw new Error('API server unreachable');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          let savedList: Poster[] = [];
          try {
            const raw = localStorage.getItem('poster_archive_items');
            if (raw) savedList = JSON.parse(raw);
          } catch (e) {
            console.warn("Could not read local backup storage", e);
          }

          if (!Array.isArray(savedList)) {
            savedList = [];
          }

          // If there is anything in the client cache, perform sync/hydration to server
          if (savedList.length > 0) {
            fetch('/api/posters/sync', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ posters: savedList })
            })
              .then(syncRes => {
                if (!syncRes.ok) throw new Error('Sync failed');
                return syncRes.json();
              })
              .then(syncedData => {
                if (Array.isArray(syncedData)) {
                  // Merge local base64 backup images back into the server's registered items
                  const merged = syncedData.map(s => {
                    const original = savedList.find(o => o.id === s.id);
                    return {
                      ...s,
                      localBackupImage: original?.localBackupImage || (original?.image?.startsWith('data:image/') ? original.image : undefined)
                    };
                  });
                  setPosters(merged);
                  localStorage.setItem('poster_archive_items', JSON.stringify(merged));
                }
              })
              .catch(err => {
                console.error("Auto-restoring assets sync failed, defaulting to local cache", err);
                setPosters(savedList);
              });
          } else {
            // No client cache or empty, simply display data retrieved from the server
            setPosters(data);
            try {
              localStorage.setItem('poster_archive_items', JSON.stringify(data));
            } catch (e) {}
          }
        }
      })
      .catch(err => {
        console.warn("Backend unavailable, falling back to offline LocalStorage cache.", err);
        try {
          const saved = localStorage.getItem('poster_archive_items');
          if (saved) {
            setPosters(JSON.parse(saved));
          }
        } catch (e) {
          setPosters([]);
        }
      });
  }, []);

  // Start editing handler
  const startEditing = (poster: Poster) => {
    setEditingId(poster.id);
    setEditTitle(poster.title);
    setEditTag(poster.tag);
  };

  // Save editing handler
  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    const cleanTitle = editTitle.trim().toUpperCase();
    const cleanTag = editTag.trim().toUpperCase();

    // Optimistically update client state
    setPosters(prev => prev.map(p => p.id === id ? { 
      ...p, 
      title: cleanTitle, 
      tag: cleanTag 
    } : p));
    setEditingId(null);

    try {
      await fetch(`/api/posters/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cleanTitle, tag: cleanTag })
      });
    } catch (err) {
      console.error("Failed persisting edit to server:", err);
    }
  };

  // Sync to backup localStorage
  useEffect(() => {
    if (posters.length > 0) {
      localStorage.setItem('poster_archive_items', JSON.stringify(posters));
    }
  }, [posters]);

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Set default dynamic tag based on existing count
  useEffect(() => {
    if (isUploadOpen) {
      const nextNumber = posters.length + 1;
      const formattedNumber = nextNumber < 10 ? `0${nextNumber}` : `${nextNumber}`;
      setNewTag(`WEEK ${formattedNumber} POSTER`);
    }
  }, [isUploadOpen, posters.length]);

  // Handle Drag Events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  // Compress image to fit safely inside transmission limitations
  const compressAndProcessImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Max dimension 1200px to ensure sharpness but high compression
          const MAX_DIM = 1200;
          if (width > MAX_DIM || height > MAX_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_DIM) / width);
              width = MAX_DIM;
            } else {
              width = Math.round((width * MAX_DIM) / height);
              height = MAX_DIM;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.82);
            resolve(compressedBase64);
          } else {
            resolve(event.target?.result as string);
          }
        };
        img.onerror = () => {
          reject(new Error('This file format is invalid. Please select an image file.'));
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        reject(new Error('Unable to read the image file.'));
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle Drop Event
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setErrorMsg(null);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Only image files (JPEG, PNG, WebP) are supported.');
        return;
      }
      try {
        setNewImageName(file.name);
        const processed = await compressAndProcessImage(file);
        setNewImage(processed);
      } catch (err: any) {
        setErrorMsg(err.message || 'Error processing your image');
      }
    }
  };

  // Handle File Input Selection
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Only image files (JPEG, PNG, WebP) are supported.');
        return;
      }
      try {
        setNewImageName(file.name);
        const processed = await compressAndProcessImage(file);
        setNewImage(processed);
      } catch (err: any) {
        setErrorMsg(err.message || 'Error processing your image');
      }
    }
  };

  // Handle URL fetch
  const handleUrlSubmit = (e: React.MouseEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!urlInput.trim()) {
      setErrorMsg('Please enter a valid image URL.');
      return;
    }
    if (!urlInput.startsWith('http://') && !urlInput.startsWith('https://')) {
      setErrorMsg('Image URL must start with http:// or https://');
      return;
    }
    setNewImage(urlInput.trim());
    setNewImageName('Remote Image Location');
  };

  // Add new poster to archive list on the server and update client state
  const handleAddPosterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const titleToUse = newTitle.trim();
    if (!titleToUse) {
      setErrorMsg('Please enter a custom title for the poster.');
      return;
    }

    const imageToUse = useUrl ? urlInput.trim() : newImage;
    if (!imageToUse) {
      setErrorMsg('Please upload an image file or provide a web URL link.');
      return;
    }

    const payload = {
      title: titleToUse.toUpperCase(),
      tag: newTag.trim().toUpperCase(),
      image: imageToUse,
      objectFit: objectFit
    };

    try {
      const res = await fetch('/api/posters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        throw new Error('Server returned an error while saving the poster.');
      }
      const savedPoster = await res.json();

      const posterWithBackup = {
        ...savedPoster,
        localBackupImage: imageToUse.startsWith('data:image/') ? imageToUse : undefined
      };
      setPosters(prev => [...prev, posterWithBackup]);
      
      // Clear and close
      setNewTitle('');
      setNewTag('');
      setNewImage('');
      setNewImageName('');
      setUrlInput('');
      setIsUploadOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error uploading poster to server.');
    }
  };

  // Delete a poster from server and client State
  const handleDeletePoster = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to remove this poster from the archive?')) {
      const updatedPosters = posters.filter(p => p.id !== id);
      setPosters(updatedPosters);
      try {
        localStorage.setItem('poster_archive_items', JSON.stringify(updatedPosters));
      } catch (e) {}

      try {
        await fetch(`/api/posters/${id}`, { method: 'DELETE' });
      } catch (err) {
        console.error("Failed to delete poster from backend server, client updated:", err);
      }
    }
  };

  // Load a demo set of images from server endpoints and reset database
  const loadDemoArchive = async () => {
    if (confirm('Would you like to load demo poster items for testing layout? This will replace current items.')) {
      try {
        const res = await fetch('/api/posters/reset', { method: 'POST' });
        if (!res.ok) throw new Error('Reset failed');
        const demoPosters = await res.json();
        setPosters(demoPosters);
        try {
          localStorage.setItem('poster_archive_items', JSON.stringify(demoPosters));
        } catch (e) {}
      } catch (err) {
        console.error("Failed resetting backend posters, doing client mockup fallback:", err);
        // Failover offline load
        const fallback: Poster[] = [];
        setPosters(fallback);
      }
    }
  };

  // Clear all archived items
  const clearAllArchive = async () => {
    if (confirm('Are you absolutely sure you want to clear your entire poster archive? This cannot be undone.')) {
      const postersToClear = [...posters];
      setPosters([]);
      try {
        localStorage.removeItem('poster_archive_items');
      } catch (e) {}

      for (const poster of postersToClear) {
        try {
          await fetch(`/api/posters/${poster.id}`, { method: 'DELETE' });
        } catch (e) {}
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between selection:bg-neutral-900 selection:text-white px-4 sm:px-8 lg:px-16 pt-12 pb-8 bg-[#FAF9F5] text-neutral-900 font-sans tracking-normal antialiased">
      
      {/* 1. Header Area Section */}
      <header className="max-w-7xl mx-auto w-full mb-16">
        
        {/* Poster Header section with Title */}
        <div className="flex flex-col items-start gap-4 mb-8">
          <div className="space-y-1.5">
            <h1 id="archive-main-title" className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900">
              POSTER ARCHIVE
            </h1>
            <p id="archive-subtitle" className="text-xs font-mono tracking-[0.25em] text-neutral-400 uppercase">
              HGU 2026-01 GRAPHIC DESIGN CLASS / 22300811 HANA HYUN
            </p>
          </div>
        </div>

        {/* Intro Message - Elegant long paragraphs in standard swiss styled column layout */}
        <div className="max-w-2xl text-[10.5px] sm:text-[11px] leading-relaxed text-neutral-500 font-light tracking-widest space-y-4 mb-8">
          <p id="welcome-description">
            Welcome to my online archive, a dedicated space showcasing a semester's worth of poster design 
            work. Through diverse themes and visual experiments, this collection captures the growth and 
            evolution of my creative process. Thank you for visiting, and I hope these visual stories resonate with 
            you. Please take your time to explore and connect with the world within each piece.
          </p>
        </div>

        {/* Minimalist Bauhaus Divider Line */}
        <div className="w-full h-[1px] bg-neutral-200" />
      </header>

      {/* 2. Main Content Gallery Grid */}
      <main className="max-w-7xl mx-auto w-full flex-grow mb-20">
        
        {/* Animated Grid Container */}
        <div className="relative min-h-[400px]">
          <AnimatePresence mode="popLayout">
            {posters.length === 0 ? (
              
              /* HIGH-FIDELITY LUXURIOUS SWISS EMPTY STATE */
              <motion.div
                key="empty-state-card"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.4 }}
                className="w-full flex flex-col items-center justify-center border border-dashed border-neutral-300 bg-white/40 rounded-sm py-28 px-4 text-center group"
                id="empty-archive-viewer"
              >
                {/* Simulated grid outlines to visually signal layout to the user */}
                <div className="flex gap-4 mb-8 select-none pointer-events-none opacity-40">
                  <div className="w-12 h-16 border border-dashed border-neutral-400 bg-neutral-100 flex items-center justify-center text-[8px] font-mono text-neutral-400">01</div>
                  <div className="w-12 h-16 border border-dashed border-neutral-400 bg-neutral-100 flex items-center justify-center text-[8px] font-mono text-neutral-400">02</div>
                  <div className="w-12 h-16 border border-dashed border-neutral-400 bg-neutral-100 flex items-center justify-center text-[8px] font-mono text-neutral-400">03</div>
                </div>

                <h3 className="text-sm font-mono tracking-widest text-neutral-700 uppercase mb-2">
                  ARCHIVE IS CURRENTLY EMPTY
                </h3>
                <p className="text-xs text-neutral-400 max-w-md mx-auto leading-relaxed font-light mb-8">
                  Get started with your dynamic online collection catalog. Click the button above to upload digital prints, mid-century objects, and typographic poster frames.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => setIsUploadOpen(true)}
                    className="text-[11px] font-mono tracking-widest text-white bg-neutral-900 border border-neutral-900 hover:bg-neutral-800 hover:border-neutral-800 px-5 py-2.5 uppercase transition-all duration-200 cursor-pointer"
                  >
                    Upload Initial Poster
                  </button>
                  <button
                    onClick={loadDemoArchive}
                    className="text-[11px] font-mono tracking-widest text-neutral-500 hover:text-neutral-950 bg-transparent border border-neutral-200 hover:border-neutral-900 px-5 py-2.5 uppercase transition-all duration-200 cursor-pointer"
                  >
                    Load Design Demo
                  </button>
                </div>
              </motion.div>
              
            ) : (
              
              /* POSTER GALLERY GRID */
              <motion.div 
                key="gallery-loaded-grid"
                variants={{
                  show: {
                    transition: {
                      staggerChildren: 0.1
                    }
                  }
                }}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-16"
              >
                {posters.map((poster, index) => (
                  <motion.div
                    key={poster.id}
                    variants={{
                      hidden: { opacity: 0, y: 30 },
                      show: { opacity: 1, y: 0 }
                    }}
                    transition={{ ease: [0.16, 1, 0.3, 1], duration: 0.6 }}
                    className="group flex flex-col justify-between"
                  >
                    {/* Visual aspect ratios with shadow details */}
                    <div className="relative aspect-[3/4] bg-neutral-100 border border-neutral-200 overflow-hidden text-clip flex items-center justify-center select-none shadow-[0_4px_20px_-8px_rgba(0,0,0,0.06)] group-hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.12)] transition-all duration-500">
                      
                      {/* Image tag */}
                      <img
                        src={poster.image}
                        alt={`${poster.tag}: ${poster.title}`}
                        referrerPolicy="no-referrer"
                        className={`w-full h-full max-w-full max-h-full transition-transform duration-700 ease-out group-hover:scale-[1.03] ${
                          poster.objectFit === 'cover' ? 'object-cover' : 'object-contain p-4 bg-white'
                        }`}
                        onError={(e) => {
                          // Fallback placeholder
                          (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=1000&auto=format&fit=crop`;
                        }}
                      />

                      {/* Interactive overlay tools */}
                      <div className="absolute inset-0 bg-neutral-950/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-3">
                        <button
                          onClick={() => setLightboxPoster(poster)}
                          className="p-3 bg-white text-neutral-900 rounded-full hover:bg-neutral-100 shadow-md transform translate-y-3 group-hover:translate-y-0 transition-all duration-300 duration-200 cursor-pointer"
                          title="Maximize Screen"
                        >
                          <Maximize2 className="w-4 h-4 stroke-[2]" />
                        </button>
                        
                        {adminMode && (
                          <button
                            onClick={(e) => handleDeletePoster(poster.id, e)}
                            className="p-3 bg-white text-red-600 rounded-full hover:bg-neutral-100 shadow-md transform translate-y-3 group-hover:translate-y-0 transition-all duration-300 transition-delay-75 duration-200 cursor-pointer"
                            title="Remove Entry"
                          >
                            <Trash2 className="w-4 h-4 stroke-[2]" />
                          </button>
                        )}
                      </div>

                      {/* Top Tag badge overlay for professional catalog layout */}
                      <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-xs px-2.5 py-1 border border-neutral-200 text-[9px] font-mono tracking-wider font-medium text-neutral-500 uppercase rounded-xs">
                        ENTRY #{index + 1 < 10 ? `0${index + 1}` : index + 1}
                      </div>
                    </div>

                    {/* Metadata Text label (Exactly matches style from user screen visual) */}
                    <div className="mt-5 text-center px-2">
                      {editingId === poster.id ? (
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 max-w-full">
                          <input
                            type="text"
                            value={editTag}
                            onChange={(e) => setEditTag(e.target.value)}
                            className="text-xs font-mono border-b border-neutral-300 focus:border-neutral-900 bg-transparent text-center focus:outline-none uppercase py-0.5 tracking-wider w-full max-w-[120px]"
                            placeholder="TAG"
                          />
                          <span className="text-xs text-neutral-400 hidden sm:inline">:</span>
                          <input
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="text-xs font-mono border-b border-neutral-300 focus:border-neutral-900 bg-transparent text-center focus:outline-none uppercase py-0.5 tracking-widest w-full max-w-[140px]"
                            placeholder="TITLE"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveEdit(poster.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                          />
                          <div className="flex gap-1.5 mt-2 sm:mt-0">
                            <button
                              type="button"
                              onClick={() => saveEdit(poster.id)}
                              className="p-1 px-2 text-[10px] bg-neutral-900 hover:bg-neutral-800 text-white font-mono rounded-xs cursor-pointer transition"
                            >
                              SAVE
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="p-1 px-2 text-[10px] border border-neutral-200 hover:bg-neutral-50 text-neutral-400 rounded-xs cursor-pointer transition"
                            >
                              X
                            </button>
                          </div>
                        </div>
                      ) : (
                        <span 
                          onClick={() => startEditing(poster)}
                          className="inline-block text-xs font-mono tracking-widest text-[#1a1a1a] uppercase cursor-pointer hover:text-neutral-500 hover:underline hover:underline-offset-4 decoration-neutral-300 transition-all"
                          title="Click to edit title"
                        >
                          {poster.tag}: {poster.title}
                        </span>
                      )}
                    </div>

                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 페이지 아래로 이동된 업로드 버튼 영역 */}
        <div className="flex justify-center items-center gap-4 mt-24 border-t border-neutral-200/60 pt-10">
          {posters.length > 0 && adminMode && (
            <button
              id="reset-archive-btn"
              onClick={clearAllArchive}
              className="text-xs font-mono tracking-widest text-neutral-400 hover:text-red-500 uppercase flex items-center gap-1.5 transition-colors duration-200 border border-neutral-200 hover:border-neutral-900 px-5 py-3 cursor-pointer"
              title="Clear all uploaded posters"
            >
              <RotateCcw className="w-4 h-4 stroke-[1.5]" /> CLEAR ALL
            </button>
          )}

          <button
            id="open-upload-modal-btn"
            onClick={() => setIsUploadOpen(true)}
            className="text-xs font-mono tracking-widest text-white hover:text-neutral-900 bg-neutral-900 hover:bg-transparent border border-neutral-900 px-6 py-3.5 uppercase flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 select-none shadow-[0_4px_12px_rgba(0,0,0,0.04)] hover:shadow-none"
          >
            <Plus className="w-4.5 h-4.5 stroke-[1.5]" />
            ARCHIVE POSTER+
          </button>
        </div>
      </main>

      {/* 3. Sliding Over-drawer or Dialog Panel for Poster Registration */}
      <AnimatePresence>
        {isUploadOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-end overflow-hidden">
            
            {/* Dark Overlay backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsUploadOpen(false)}
              className="absolute inset-0 bg-neutral-950 cursor-pointer"
            />

            {/* Solid Drawer Content container */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="relative w-full max-w-lg h-full bg-white shadow-2xl flex flex-col justify-between"
            >
              {/* Drawer Header */}
              <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-mono tracking-widest text-neutral-800 uppercase flex items-center gap-2">
                    <Upload className="w-4 h-4 text-neutral-500" />
                    ARCHIVE NEW POSTER
                  </h2>
                  <p className="text-[11px] text-neutral-400 font-light mt-0.5">
                    Insert your metadata records and graphic content values.
                  </p>
                </div>
                <button
                  onClick={() => setIsUploadOpen(false)}
                  className="p-1 px-1.5 border border-transparent hover:border-neutral-200 hover:bg-neutral-50 text-neutral-400 hover:text-neutral-700 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form elements Container scrollable */}
              <form onSubmit={handleAddPosterSubmit} className="flex-grow overflow-y-auto p-6 space-y-7">
                
                {/* Title Input Field */}
                <div className="space-y-4">
                  <label className="block text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                    제목 (필수) / TITLE (REQUIRED)
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="예: 가볍고 덧없는, CHAIR, GLASS"
                    className="w-full border-b border-neutral-300 focus:border-neutral-900 bg-transparent py-2.5 text-xs text-neutral-800 outline-none uppercase tracking-widest transition-colors"
                    required
                    autoFocus
                  />
                </div>

                {/* File Upload Panel */}
                <div className="space-y-4">
                  <label className="block text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                    포스터 이미지 파일 / POSTER IMAGE FILE
                  </label>

                  {newImage ? (
                    <div className="relative border border-neutral-200 p-2 bg-neutral-50 flex items-center justify-center min-h-[160px] max-h-[220px] overflow-hidden rounded-xs group">
                      <img 
                        src={newImage} 
                        alt="Pending Upload" 
                        className="max-h-[140px] max-w-full object-contain bg-white shadow-xs" 
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNewImage('');
                          setNewImageName('');
                        }}
                        className="absolute inset-0 bg-neutral-900/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[11px] font-mono tracking-widest uppercase transition-opacity duration-200 cursor-pointer"
                      >
                        다른 이미지로 변경 / Change Image
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragEnter={handleDrag}
                      onDragOver={handleDrag}
                      onDragLeave={handleDrag}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border border-dashed p-8 text-center cursor-pointer transition-all duration-200 rounded-xs ${
                        dragActive 
                          ? 'border-neutral-900 bg-neutral-100' 
                          : 'border-neutral-300 hover:border-neutral-400'
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <div className="flex flex-col items-center justify-center space-y-2 select-none">
                        <ImageIcon className="w-7 h-7 text-neutral-400 stroke-[1.25]" />
                        <span className="text-[11px] font-mono text-neutral-500">
                          이곳을 클릭하거나 이미지 파일을 드래그하세요
                        </span>
                        <span className="text-[9px] text-neutral-400 font-light">
                          PNG, JPG, OR WEBP FORMATS
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Dynamic alert feedback errors */}
                {errorMsg && (
                  <div className="border-l-2 border-red-500 bg-red-50 text-red-700 p-3.5 text-xs font-mono rounded-r-xs flex items-center justify-between">
                    <span>{errorMsg}</span>
                    <button type="button" onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

              </form>

              {/* Drawer Footer controls */}
              <div className="p-6 border-t border-neutral-100 bg-neutral-50 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsUploadOpen(false)}
                  className="flex-1 text-xs font-mono tracking-widest text-neutral-500 hover:text-neutral-900 bg-transparent border border-neutral-300 px-4 py-3 uppercase cursor-pointer text-center transitionAll duration-200"
                >
                  CANCEL
                </button>
                <button
                  onClick={handleAddPosterSubmit}
                  className="flex-1 text-xs font-mono tracking-widest text-white bg-neutral-900 border border-neutral-900 hover:bg-neutral-800 hover:border-neutral-800 px-4 py-3 uppercase cursor-pointer text-center font-medium transitionAll duration-200"
                >
                  UPLOAD TO ARCHIVE
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. Lightbox Fullscreen modal component */}
      <AnimatePresence>
        {lightboxPoster && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-8 bg-neutral-950/95 backdrop-blur-sm">
            
            {/* Click of background yields exit */}
            <div className="absolute inset-0 cursor-zoom-out" onClick={() => setLightboxPoster(null)} />
            
            <button
              onClick={() => setLightboxPoster(null)}
              className="absolute top-4 right-4 sm:top-8 sm:right-8 z-10 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative max-w-full max-h-[85vh] aspect-[3/4]"
            >
              <img
                src={lightboxPoster.image}
                alt={lightboxPoster.title}
                referrerPolicy="no-referrer"
                className="max-w-[90vw] max-h-[80vh] object-contain bg-white p-2 border border-neutral-200 shadow-2xl rounded-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = `https://images.unsplash.com/photo-1544947950-fa07a98d237f?q=80&w=1000&auto=format&fit=crop`;
                }}
              />
              <div className="absolute -bottom-14 left-0 right-0 text-center">
                <p className="text-sm font-mono tracking-widest text-white uppercase">
                  {lightboxPoster.tag}: {lightboxPoster.title}
                </p>
                <p className="text-[10px] font-mono tracking-wider text-neutral-400 mt-1 uppercase">
                  SWISS MINIMALIST POSTER PRINT SERIES
                </p>
              </div>
            </motion.div>

          </div>
        )}
      </AnimatePresence>

      {/* 5. Minimalist Swiss Poster Footer Block */}
      <footer className="max-w-7xl mx-auto w-full border-t border-neutral-200 pt-8 mt-12 flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-mono text-neutral-400 uppercase tracking-widest text-center md:text-left select-none">
        
        {/* Left column */}
        <div id="footer-copyright">
          © 2026 A3 POSTER ARCHIVE.
        </div>

        {/* Center column slogan */}
        <div id="footer-slogan" className="text-neutral-500 max-w-lg leading-relaxed px-4 md:px-0 text-center">
          CONSERVING MID-CENTURY MODERNISM, BAUHAUS LAYOUT, & SWISS MINIMALISM
        </div>

        {/* Right column badge */}
        <div id="footer-admin" className="flex items-center gap-2">
          <span>ARCHIVIST ADMIN:</span>
          <button 
            type="button"
            onClick={() => setAdminMode(!adminMode)}
            className="flex items-center gap-1.5 focus:outline-none cursor-pointer"
          >
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${adminMode ? 'bg-emerald-500 animate-pulse' : 'bg-neutral-300'}`} />
            <span className={adminMode ? 'text-neutral-700 font-medium' : 'text-neutral-400'}>
              [{adminMode ? 'ON' : 'OFF'}]
            </span>
          </button>
        </div>

      </footer>

    </div>
  );
}
