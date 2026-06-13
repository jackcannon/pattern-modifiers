import { useState } from 'react';
import { Button, Snackbar, Tooltip } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import DownloadIcon from '@mui/icons-material/Download';
import IosShareIcon from '@mui/icons-material/IosShare';

import { FormObject, FormSchema } from '../form/schema';
import { buildShareUrl } from '../form/shareUrl';
import { Form } from '../form/Form';
import { downloadSTL } from '../generate/stl';

import logo from '/logo.svg';
import boxbuilderLogo from '/boxbuilder-logo.svg';

import './sidebar.css';

interface Props {
  style: React.CSSProperties | undefined;
  form: FormObject;
  setForm: (form: FormObject) => void;
}

export const Sidebar = ({ style, form, setForm }: Props) => {
  const [shareNotice, setShareNotice] = useState<string | null>(null);

  const handleShare = async () => {
    const url = buildShareUrl(form);

    try {
      await navigator.clipboard.writeText(url);
      setShareNotice('Share link copied to clipboard');
    } catch {
      setShareNotice(url);
    }
  };

  return (
    <section className="sidebar" style={style}>
      <img src={logo} alt="logo" className="logo" />

      <Form object={form} schema={FormSchema} onChange={setForm} />

      <div className="gap"></div>

      <div className="actions">
        <Button
          variant="contained"
          size="large"
          className="actions-download"
          startIcon={<DownloadIcon />}
          onClick={() => downloadSTL(form)}
        >
          Download STL
        </Button>
        <Tooltip title="Copy share link" placement="top" arrow>
          <Button variant="outlined" size="large" className="actions-share" aria-label="Copy share link" onClick={handleShare}>
            <IosShareIcon />
          </Button>
        </Tooltip>
      </div>

      <div className="footer">
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

      <Snackbar
        open={shareNotice !== null}
        autoHideDuration={shareNotice?.startsWith('http') ? 8000 : 3000}
        message={shareNotice ?? ''}
        onClose={() => setShareNotice(null)}
      />
    </section>
  );
};
