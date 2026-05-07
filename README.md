# Project ToDo Tool

`Project ToDo Tool` is a single-file browser app for managing projects and ToDos.

It is designed to stay simple:

- no framework
- no build step
- no external dependencies
- no server

Everything runs from `project_todo_tool.html`.

## What It Does

The app lets you:

- create and delete projects
- create, edit, reorder, and delete ToDos
- mark ToDos as done
- set priority and due dates
- search and filter tasks
- import and export JSON backups
- switch between dark and light theme

The main UI is intentionally direct. Most fields are edited inline in the task list without opening extra dialogs.

## Files In This Repo

- `project_todo_tool.html`: the complete application
- `project-todos.json`: an example data file

## Browser Modes

The app supports two storage modes.

### Chrome / Opera mode

Current Chrome and Opera use direct file mode:

- click `Connect Folder`
- choose the folder for `project-todos.json`
- the app autosaves directly into that JSON file
- the app can remember the folder handle and restore access when the browser allows it

### Safari mode

Safari uses browser-storage mode:

- no folder connection is required
- the app autosaves live data in browser storage
- JSON is used through `Download Backup` and `Import Backup`
- Safari does not continuously write back into an arbitrary local folder

Chrome and Opera stay file-based. Safari stays browser-based.
Other non-Safari browsers without File System Access support are not a target mode for this app.

## How To Run

### In Chrome or Opera

1. Open `project_todo_tool.html`.
2. Click `Connect Folder`.
3. Choose the folder where `project-todos.json` should live.

### In Safari

1. Open `project_todo_tool.html`.
2. Start working immediately.
3. Use `Download Backup` whenever you want a JSON copy on disk.

## How Saving Works

The app has no backend.

### File mode

In Chrome and Opera:

- data is written directly to `project-todos.json`
- changes are autosaved after edits
- dirty-state protection warns before the tab closes
- if access is lost, editing pauses to avoid silent data loss
- restoring access tries to save current in-memory changes before any reload from disk

### Browser-storage mode

In Safari:

- data is autosaved in browser storage
- the app tracks the last autosave and the last downloaded backup
- the status area shows when the backup is out of date
- JSON backups are manual export/import artifacts, not the live storage backend

## Data Format

The app writes a payload wrapper around the actual task data.

Current payload version:

- `5`

Shape:

```json
{
  "app": "Project ToDo Tool",
  "version": 5,
  "savedAt": "2026-05-07T12:34:56.789Z",
  "data": {
    "projects": [],
    "selectedProjectId": null,
    "settings": {
      "theme": "dark"
    }
  }
}
```

The loader accepts:

- payload wrapper objects
- direct state objects
- older backups that need normalization or migration

Normalization repairs or clears:

- invalid dates
- invalid booleans
- duplicate IDs
- broken selected project references

## Main Workflows

### Create a project

- enter a name in `New Project`
- click `Create Project`

### Add a ToDo

- type into the quick-entry field
- optionally set priority and due date
- press `Shift+Enter`

New ToDos are inserted into the list and stay inline-editable.

### Edit a ToDo

You can update:

- title
- due date
- priority
- done state

Notes remain persisted and searchable. The inline notes field appears only for tasks that already contain stored notes.

### Reorder

Projects:

- drag and drop
- or use the up/down buttons

Tasks:

- drag and drop
- or use the up/down buttons

Task reordering is disabled while search or filtering is active, because the visible list no longer matches the full stored order.

## Import And Export

### Download / Export

- Chrome / Opera: `Export Backup`
- Safari: `Download Backup`

Both actions download a JSON payload backup.

### Import

`Import Backup`:

- asks for confirmation before replacing the current state
- normalizes import data before activation
- rolls back if parsing or persistence fails

If an import fails, the previous state is restored.

## Theme

The theme is toggled with a single button.

Behavior:

- dark and light themes are supported
- the current choice is remembered locally
- the theme is also persisted inside the app state when the storage backend is available

## Robustness Notes

The app handles several failure cases explicitly:

- dirty-state protection for unsaved in-memory changes
- a `beforeunload` warning when unsaved changes exist
- a safer reconnect flow for remembered folders
- guarded reload/import flows so data is not overwritten silently
- safer file writes with writable abort handling
- a browser-storage fallback for Safari
- status rendering without `innerHTML`
- viewport/focus stabilization for checkbox and due-date edits

## Limitations

- Safari does not use direct folder-based live JSON writing
- browser-storage mode is local to the current browser profile
- the app is meant for local single-user use
- no server sync
- no authentication

## Development Notes

This repo intentionally keeps the app in one HTML file.

That means:

- HTML, CSS, and JavaScript live together
- local testing stays simple
- portability stays high

If you change the app, keep these constraints in mind:

- preserve single-file behavior
- avoid new dependencies unless they are truly needed
- keep compatibility with existing `project-todos.json` backups
- keep Chrome/Opera file mode stable while changing Safari mode

## Recommended Manual Checks

After meaningful changes, verify at least:

1. open the app in Chrome or Opera
2. connect a folder and create a fresh `project-todos.json`
3. create a project and several ToDos
4. edit due date, priority, and done state
5. search and filter
6. reorder projects and tasks
7. export and import a backup
8. reload from disk in file mode
9. open the app in Safari and confirm that browser-storage mode starts without a folder picker
10. download a backup in Safari and confirm that the status updates
11. close the tab with unsaved changes and confirm that the warning appears

## License
