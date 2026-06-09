import { Button, Tooltip } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';
import DownloadIcon from '@mui/icons-material/Download';

import { FormObject, FormSchema } from '../form/schema';
import { Form } from '../form/Form';
import { downloadSTL } from '../generate/stl';

import logo from '/logo.svg';

import './sidebar.css';

interface Props {
  style: React.CSSProperties | undefined;
  form: FormObject;
  setForm: (form: FormObject) => void;
}

export const Sidebar = ({ style, form, setForm }: Props) => {
  return (
    <section className="sidebar" style={style}>
      <img src={logo} alt="logo" className="logo" />

      <Form object={form} schema={FormSchema} onChange={setForm} />

      <div className="gap"></div>

      <div className="download">
        <Button variant="contained" size="large" fullWidth startIcon={<DownloadIcon />} onClick={() => downloadSTL(form)}>
          Download STL
        </Button>
      </div>

      <div className="footer">
        <Tooltip title="View source on GitHub" arrow>
          <a href="https://github.com/jackcannon/pattern-modifiers" target="_blank" className="github-link">
            <GitHubIcon />
          </a>
        </Tooltip>
      </div>
    </section>
  );
};
