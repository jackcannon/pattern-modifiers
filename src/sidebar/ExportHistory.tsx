import { FormControl, IconButton, MenuItem, Select, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

import { getPatternDefinition } from '../generate/patterns/registry';
import { ExportHistoryListItem } from '../form/exportHistoryStorage';
import { FormObject } from '../form/schema';

interface Props {
  entries: ExportHistoryListItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onApply: () => void;
  onDelete: (id: string) => void;
}

export const ExportHistory = ({ entries, selectedId, onSelect, onApply, onDelete }: Props) => {
  if (entries.length === 0) return null;

  const formatLabel = (fileName: string, patternType: FormObject['type']) =>
    `${fileName} (${getPatternDefinition(patternType).label})`;

  return (
    <div className="export-history">
      <span className="export-history-label">Past exports</span>
      <div className="export-history-row">
        <FormControl size="small" className="export-history-select">
          <Select
            displayEmpty
            value={selectedId}
            onChange={(event) => onSelect(event.target.value)}
            renderValue={(value) => {
              if (!value) return 'Select an export…';

              const entry = entries.find((item) => item.id === value);
              return entry ? formatLabel(entry.fileName, entry.patternType) : 'Select an export…';
            }}
          >
            {entries.map((entry) => (
              <MenuItem key={entry.id} value={entry.id}>
                {formatLabel(entry.fileName, entry.patternType)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Apply export settings" arrow>
          <span>
            <IconButton
              size="small"
              className="export-history-action"
              aria-label="Apply export settings"
              disabled={!selectedId}
              onClick={onApply}
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Remove from history" arrow>
          <span>
            <IconButton
              size="small"
              className="export-history-action"
              aria-label="Remove from history"
              disabled={!selectedId}
              onClick={() => selectedId && onDelete(selectedId)}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </div>
    </div>
  );
};
