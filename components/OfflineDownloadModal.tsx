"use client";

import React, { useState, useEffect } from "react";
import { Loader2, Check, X } from "lucide-react";

interface OfflineDownloadModalProps {
  isOpen: boolean;
  bookNumber?: number;
  bookTitle?: string;
  totalPages: number;
  onComplete: () => void;
}

export default function OfflineDownloadModal({
  isOpen,
  totalPages,
  onComplete,
}: OfflineDownloadModalProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [isDone, setIsDone] = useState(false);

  const safeTotal = Math.max(5, totalPages || 25);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPage(1);
      setIsDone(false);
      return;
    }

    const duration = 1200; // 1.2s fast & smooth animation
    const intervalTime = Math.max(25, Math.floor(duration / safeTotal));

    let page = 1;
    setCurrentPage(1);
    setIsDone(false);

    const timer = setInterval(() => {
      page += 1;
      if (page >= safeTotal) {
        setCurrentPage(safeTotal);
        setIsDone(true);
        clearInterval(timer);
        const closeTimer = setTimeout(() => {
          onComplete();
        }, 350);
        return () => clearTimeout(closeTimer);
      } else {
        setCurrentPage(page);
      }
    }, intervalTime);

    // Safety fallback: guaranteed auto-dismiss within 2 seconds
    const safetyTimer = setTimeout(() => {
      setIsDone(true);
      onComplete();
    }, 2000);

    return () => {
      clearInterval(timer);
      clearTimeout(safetyTimer);
    };
  }, [isOpen, safeTotal, onComplete]);

  if (!isOpen) return null;

  const progressPercent = Math.min(100, Math.round((currentPage / safeTotal) * 100));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      onClick={onComplete}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white text-[#111111] rounded-2xl sm:rounded-3xl border border-black/10 p-5 sm:p-6 max-w-xs w-full shadow-2xl relative text-center animate-in zoom-in-95 duration-150"
      >
        {/* Dismiss / Close Button */}
        <button
          type="button"
          onClick={onComplete}
          className="absolute top-3 right-3 p-1 rounded-full text-black/40 hover:text-black hover:bg-black/5 transition cursor-pointer"
          title="Close"
        >
          <X size={16} />
        </button>

        {/* Minimal Clean Icon */}
        <div className="w-10 h-10 rounded-full bg-black/5 mx-auto mb-3 flex items-center justify-center text-black">
          {isDone ? (
            <Check size={20} className="text-emerald-600" />
          ) : (
            <Loader2 size={20} className="animate-spin text-black" />
          )}
        </div>

        {/* Minimal English Heading */}
        <h3 className="text-sm font-bold text-black mb-1">
          {isDone ? "Saved offline" : "Saving book offline..."}
        </h3>

        {/* Page Count */}
        <p className="text-xs font-mono text-black/60 mb-3.5">
          {currentPage} / {safeTotal} pages ({progressPercent}%)
        </p>

        {/* Minimal Sleek Loading Line Bar */}
        <div className="w-full bg-black/8 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-75 ease-out ${
              isDone ? "bg-emerald-600" : "bg-black"
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}
