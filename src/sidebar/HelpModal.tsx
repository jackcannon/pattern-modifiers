import { useEffect, useId, useState } from 'react';
import { Button, Dialog, IconButton, Tooltip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowLeft from '@mui/icons-material/KeyboardArrowLeft';
import KeyboardArrowRight from '@mui/icons-material/KeyboardArrowRight';

import { getHelpPageImageSrcs, HELP_PAGES, preloadHelpImages, type HelpPage } from './helpPages';

import './helpModal.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

const Hero = ({ page, onClose }: { page: HelpPage; onClose: () => void }) => {
  const src = page.pendingScreenshot ? '/help/placeholder.svg' : page.imageSrc;
  const fitContain = page.imageFit === 'contain' || !!page.pendingScreenshot;

  return (
    <div className="help-hero">
      {page.compare ? (
        <div className="help-hero-compare-grid">
          <figure className="help-hero-compare-item">
            <img src={page.compare.left.src} alt={page.compare.left.alt} />
            <figcaption>{page.compare.left.label}</figcaption>
          </figure>
          <figure className="help-hero-compare-item">
            <img src={page.compare.right.src} alt={page.compare.right.alt} />
            <figcaption>{page.compare.right.label}</figcaption>
          </figure>
        </div>
      ) : (
        <img
          src={src}
          alt={page.imageAlt}
          className={fitContain ? 'help-hero-img help-hero-img-contain' : 'help-hero-img'}
        />
      )}

      {/* Solid wash from transparent → modal bg; sits above the image */}
      <div className="help-hero-fade" aria-hidden />

      <Tooltip title="Close" arrow>
        <IconButton aria-label="Close help" onClick={onClose} size="small" className="help-close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export const HelpModal = ({ open, onClose }: Props) => {
  const [pageIndex, setPageIndex] = useState(0);
  const titleId = useId();
  const page = HELP_PAGES[pageIndex];
  const max = HELP_PAGES.length;
  const isLast = pageIndex === max - 1;

  useEffect(() => {
    if (!open) return;
    setPageIndex(0);
    // Warm page 1 if hover never fired (e.g. keyboard/touch), then the rest.
    preloadHelpImages(HELP_PAGES.flatMap(getHelpPageImageSrcs));
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby={titleId}
      className="help-dialog"
      PaperProps={{ className: 'help-dialog-paper' }}
    >
      <div className="help-dialog-body">
        <div className="help-page">
          <Hero page={page} onClose={onClose} />
          <div className="help-copy">
            <h2 className="help-title" id={titleId}>
              {page.title}
            </h2>
            <p className="help-lead">{page.lead}</p>
            {page.note && <p className="help-note">{page.note}</p>}
            {page.pendingScreenshot && <p className="help-pending">Screenshot coming soon</p>}
          </div>
        </div>
      </div>

      <div className="help-dialog-actions">
        <Button size="small" onClick={() => setPageIndex((i) => Math.max(0, i - 1))} disabled={pageIndex === 0}>
          <KeyboardArrowLeft />
          Back
        </Button>
        <span className="help-page-count">
          {pageIndex + 1} / {max}
        </span>
        {isLast ? (
          <Button size="small" onClick={onClose}>
            Done
          </Button>
        ) : (
          <Button size="small" onClick={() => setPageIndex((i) => Math.min(max - 1, i + 1))}>
            Next
            <KeyboardArrowRight />
          </Button>
        )}
      </div>
    </Dialog>
  );
};
