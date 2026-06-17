import { ThemeProvider, createTheme } from '@mui/material/styles';

import { FormSchema, createDefaultFormObj } from './form/schema';
import { SceneRender } from './render/Render';
import { Sidebar } from './sidebar/Sidebar';

import { SIDEBAR_PERCENT } from './constants';
import { useHistoryDoc } from './useHistoryDoc';

import './App.css';

const primary = { main: '#FFDC00' };

const theme = createTheme({
  colorSchemes: {
    light: { palette: { primary } },
    dark: { palette: { primary } }
  }
});

const getStyle = (percent: number) => ({
  width: `${percent}vw`
});

const App = () => {
  const [form, setForm, resetForm] = useHistoryDoc(FormSchema, createDefaultFormObj);

  const sidebarSize = SIDEBAR_PERCENT;
  const renderSize = 100 - SIDEBAR_PERCENT;

  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <main>
        <Sidebar form={form} setForm={setForm} onReset={resetForm} style={getStyle(sidebarSize)} />
        <SceneRender form={form} style={getStyle(renderSize)} />
      </main>
    </ThemeProvider>
  );
};

export default App;
