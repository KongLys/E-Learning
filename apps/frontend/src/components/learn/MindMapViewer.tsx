'use client';

import { useEffect, useRef } from 'react';
import { Transformer } from 'markmap-lib';
import { Markmap } from 'markmap-view';
import { Download, Maximize2 } from 'lucide-react';
import type { MindmapNode } from '@/lib/api/ai.api';

const transformer = new Transformer();

interface MindMapViewerProps {
  markmap: string;
  title?: string;
  structure?: unknown;
}

/**
 * Renders Markmap-flavoured markdown into an interactive (zoom / collapse) SVG.
 * Client-only — markmap-view manipulates the DOM directly.
 */
export function MindMapViewer({ markmap, title, structure }: MindMapViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current, { duration: 300 });
    }
    const { root } = transformer.transform(markmap || '# (trống)');
    mmRef.current.setData(root);
    void mmRef.current.fit();
  }, [markmap]);

  useEffect(() => {
    return () => {
      mmRef.current?.destroy();
      mmRef.current = null;
    };
  }, []);

  const download = (content: string, ext: string, mime: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'mindmap').replace(/[^\wÀ-ỹ -]/g, '').trim() || 'mindmap'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end gap-2 mb-2">
        <button
          onClick={() => download(markmap, 'md', 'text/markdown')}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          <Download className="w-3.5 h-3.5" /> Markdown
        </button>
        <button
          onClick={() =>
            download(JSON.stringify(structure ?? {}, null, 2), 'json', 'application/json')
          }
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          <Download className="w-3.5 h-3.5" /> JSON
        </button>
        <button
          onClick={() => void mmRef.current?.fit()}
          className="inline-flex items-center gap-1 text-xs text-gray-600 hover:text-blue-700 px-2 py-1 rounded hover:bg-gray-100"
        >
          <Maximize2 className="w-3.5 h-3.5" /> Vừa khung
        </button>
      </div>
      <div className="flex-1 min-h-[420px] border rounded-xl bg-white overflow-hidden">
        <svg ref={svgRef} className="w-full h-full" />
      </div>
    </div>
  );
}

/** Re-exported for callers that need the node shape. */
export type { MindmapNode };
