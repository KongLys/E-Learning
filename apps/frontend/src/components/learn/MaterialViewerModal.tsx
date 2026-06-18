'use client';

export type MaterialKind = 'video' | 'youtube' | 'pdf' | 'docx';

interface MaterialViewerModalProps {
  title: string;
  kind: MaterialKind;
  /** signed URL (video/pdf/docx) hoặc embed URL (youtube). */
  url: string;
  onClose: () => void;
}

export function MaterialViewerModal({ title, kind, url, onClose }: MaterialViewerModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <h2 className="text-lg font-bold truncate">{title}</h2>
          <button
            onClick={onClose}
            className="shrink-0 text-xl text-gray-400 hover:text-gray-700"
            aria-label="Đóng"
          >
            ✕
          </button>
        </div>
        <div className="px-6 py-5">
          {kind === 'video' && (
            <video controls src={url} className="w-full max-h-[70vh] rounded-lg bg-black">
              Trình duyệt của bạn không hỗ trợ phát video.
            </video>
          )}
          {kind === 'youtube' && (
            <div className="aspect-video w-full">
              <iframe
                src={url}
                title={title}
                className="h-full w-full rounded-lg"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {kind === 'pdf' && (
            <iframe src={url} title={title} className="w-full h-[70vh] rounded-lg ring-1 ring-gray-100" />
          )}
          {kind === 'docx' && (
            <div className="rounded-2xl bg-slate-50 py-10 text-center">
              <p className="mb-3 text-sm font-medium text-gray-800">📄 {title}</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-600 hover:underline"
              >
                Tải về để đọc
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
