import { useState } from 'react';
import { Button, IconButton, Snackbar, Tooltip } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import DownloadIcon from '@mui/icons-material/Download';
import IosShareIcon from '@mui/icons-material/IosShare';
import RefreshIcon from '@mui/icons-material/Refresh';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

import { applyExportToForm, getExportDisplayFileName } from '../form/exportState';
import { loadExportHistoryRecord, useExportHistory } from '../form/exportHistoryStorage';
import { FormObject, FormSchema } from '../form/schema';
import { buildShareUrl } from '../form/shareUrl';
import { Form } from '../form/Form';
import { download3MF } from '../generate/export3mf';
import { downloadSTL } from '../generate/stl';

import { ExportHistory } from './ExportHistory';
import { HelpModal } from './HelpModal';
import { HELP_PAGES, preloadHelpPageImages } from './helpPages';

import logo from '/logo.svg';
import boxbuilderLogo from '/boxbuilder-logo.svg';

import './sidebar.css';

interface Props {
  style: React.CSSProperties | undefined;
  form: FormObject;
  setForm: (form: FormObject) => void;
  onReset: () => void;
}

export const Sidebar = ({ style, form, setForm, onReset }: Props) => {
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpOpening, setHelpOpening] = useState(false);
  const { entries, selectedId, setSelectedId, record, remove } = useExportHistory();

  const openHelp = async () => {
    if (helpOpen || helpOpening) return;
    setHelpOpening(true);
    await preloadHelpPageImages(HELP_PAGES[0]);
    setHelpOpening(false);
    setHelpOpen(true);
  };

  const handleShare = async () => {
    const url = buildShareUrl(form);

    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Share link copied to clipboard');
    } catch {
      setShareNotice(url);
    }
  };

  const handleDownloadStl = () => {
    downloadSTL(form, getExportDisplayFileName(form));
    record(form);
  };

  const handleDownload3mf = () => {
    download3MF(form, getExportDisplayFileName(form));
    record(form);
  };

  const handleSelectExport = (id: string) => {
    setSelectedId(id);
  };

  const handleApplyExport = () => {
    if (!selectedId) return;

    const stored = loadExportHistoryRecord(selectedId);
    if (!stored) return;

    setForm(applyExportToForm(form, stored.effective));
  };

  return (
    <section className="sidebar" style={style}>
      <div className="sidebar-header">
        <img src={logo} alt="logo" className="logo" />
        <Tooltip title="Help" placement="left" arrow>
          <IconButton
            className="sidebar-help"
            size="small"
            aria-label="Open help"
            aria-busy={helpOpening}
            disabled={helpOpening}
            onClick={() => void openHelp()}
            onMouseEnter={() => void preloadHelpPageImages(HELP_PAGES[0])}
            onFocus={() => void preloadHelpPageImages(HELP_PAGES[0])}
          >
            <HelpOutlineIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </div>

      <Form object={form} schema={FormSchema} onChange={setForm} />

      <div className="gap"></div>

      <div className="actions">
        <Button
          variant="contained"
          size="large"
          className="actions-download actions-download-stl"
          startIcon={<DownloadIcon />}
          onClick={handleDownloadStl}
        >
          STL
        </Button>
        <Button
          variant="contained"
          size="large"
          className="actions-download actions-download-3mf"
          startIcon={<DownloadIcon />}
          onClick={handleDownload3mf}
        >
          3MF
        </Button>
        <Tooltip title="Copy share link" placement="top" arrow>
          <Button variant="outlined" size="large" className="actions-share" aria-label="Copy share link" onClick={handleShare}>
            <IosShareIcon />
          </Button>
        </Tooltip>
      </div>

      <ExportHistory
        entries={entries}
        selectedId={selectedId}
        onSelect={handleSelectExport}
        onApply={handleApplyExport}
        onDelete={remove}
      />

      <div className="footer">
        <Tooltip title="Reset all fields to defaults" arrow>
          <button type="button" className="footer-link footer-reset" onClick={onReset}>
            <RefreshIcon />
            Reset
          </button>
        </Tooltip>
        <div className="footer-links">
          <Tooltip title="BoxBuilder" arrow>
            <a
              href="https://boxbuilder.cannonbury.co.uk/"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link boxbuilder-link"
            >
              <img src={boxbuilderLogo} alt="BoxBuilder" />
            </a>
          </Tooltip>
          <Tooltip title="View source on GitHub" arrow>
            <a
              href="https://github.com/jackcannon/pattern-modifiers"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link github-link"
            >
              <GitHubIcon />
            </a>
          </Tooltip>
        </div>
      </div>

      <Snackbar
        open={shareNotice !== null}
        autoHideDuration={shareNotice?.startsWith('http') ? 8000 : 3000}
        message={shareNotice ?? ''}
        onClose={() => setShareNotice(null)}
      />

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </section>
  );
};
