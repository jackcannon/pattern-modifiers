import { Tooltip } from '@mui/material';
import GitHubIcon from '@mui/icons-material/GitHub';

import { FormObject, FormSchema } from '../form/schema';
import { Form } from '../form/Form';

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
