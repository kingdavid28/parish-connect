import { Dialog, DialogClose, DialogContent, DialogTitle } from "./ui/dialog";
import { X } from "lucide-react";

interface ImageLightboxProps {
  src: string | null;
  alt?: string;
  onClose: () => void;
}

/** Fullscreen image viewer — tap/Esc/X to close. Pass src=null when closed. */
export default function ImageLightbox({ src, alt = "Image", onClose }: ImageLightboxProps) {
  return (
    <Dialog open={!!src} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="w-auto max-w-[95vw] sm:max-w-[95vw] p-0 border-none bg-transparent shadow-none gap-0 [&>button]:hidden"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {src && (
          <div className="relative">
            <img
              src={src}
              alt={alt}
              className="max-h-[88vh] max-w-[95vw] rounded-xl object-contain shadow-2xl"
            />
            <DialogClose
              className="absolute -top-3 -right-3 rounded-full bg-white/90 p-1.5 text-gray-800 shadow hover:bg-white"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </DialogClose>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
