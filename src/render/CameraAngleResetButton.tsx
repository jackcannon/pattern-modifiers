import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { IconButton, Tooltip } from '@mui/material';

interface Props {
  onReset: () => void;
}

export const CameraAngleResetButton = ({ onReset }: Props) => {
  return (
    <div className="render-angle-reset">
      <Tooltip title="Reset camera angle" arrow placement="left">
        <IconButton size="small" aria-label="Reset camera angle" className="render-focus-button" onClick={onReset}>
          <RestartAltIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};
