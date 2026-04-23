# Requirements Document

## Introduction

The CB8 Electron desktop application currently displays the comic library as a grid sorted by title (ascending) with a text search bar. This feature adds sort and filter controls to the Library_View, enabling users to sort comics by multiple fields, toggle sort direction, and filter by read status, file type, and tag. User preferences for sort and filter settings persist across application sessions via the existing app metadata store.

## Glossary

- **Application**: The CB8 Electron desktop comic book reader application
- **Library_View**: The React component (`LibraryView.tsx`) that displays the library contents as a virtualized grid of comic cover cards
- **Sort_Control**: A dropdown or segmented control in the Library_View toolbar that selects the active sort field
- **Sort_Direction_Toggle**: A button in the Library_View toolbar that switches between ascending and descending sort order
- **Filter_Bar**: A horizontal strip of filter controls rendered below the search bar in the Library_View, containing read status pills, file type pills, and a tag selector
- **Read_Status**: A derived classification of a comic's reading state: `unread` (lastPage is null and lastRead is null), `in-progress` (lastPage is not null or lastRead is not null), or `completed` (lastPage equals pageCount minus 1)
- **Sort_Field**: One of the supported sort columns: `title`, `dateAdded`, `fileSize`, `pageCount`, or `lastRead`
- **Filter_Preset**: The combination of active sort field, sort direction, read status filter, file type filter, and tag filter that defines the current Library_View query configuration
- **App_Meta_Store**: The key-value metadata table in the SQLite database used by `LibraryDatabase.getAppMeta` and `setAppMeta` to persist application settings
- **Query_Options**: The `QueryOptions` TypeScript interface used to pass sort, filter, and pagination parameters to the database query layer

## Requirements

### Requirement 1: Sort Field Selection

**User Story:** As a reader, I want to choose how my comics are sorted, so that I can find comics by different criteria such as title, date added, or file size.

#### Acceptance Criteria

1. THE Library_View SHALL display a Sort_Control in the toolbar area above the comic grid.
2. WHEN the user activates the Sort_Control, THE Library_View SHALL present the following Sort_Field options: Title, Date Added, File Size, Pages, and Recently Read.
3. WHEN the user selects a Sort_Field, THE Library_View SHALL re-query the comic list using the selected Sort_Field and refresh the grid.
4. THE Library_View SHALL visually indicate the currently active Sort_Field in the Sort_Control.

### Requirement 2: Sort Direction Toggle

**User Story:** As a reader, I want to toggle between ascending and descending sort order, so that I can view comics in the order that suits my browsing needs.

#### Acceptance Criteria

1. THE Library_View SHALL display a Sort_Direction_Toggle adjacent to the Sort_Control.
2. WHEN the user activates the Sort_Direction_Toggle, THE Library_View SHALL switch the sort order between ascending and descending and re-query the comic list.
3. THE Sort_Direction_Toggle SHALL visually indicate the current sort direction using an arrow icon (upward for ascending, downward for descending).
4. WHEN the Sort_Field is `dateAdded` or `lastRead`, THE Library_View SHALL default the sort direction to descending.
5. WHEN the Sort_Field is `title`, THE Library_View SHALL default the sort direction to ascending.

### Requirement 3: Filter by Read Status

**User Story:** As a reader, I want to filter my library by read status, so that I can quickly find unread comics or revisit completed ones.

#### Acceptance Criteria

1. THE Filter_Bar SHALL display read status pill buttons with the options: All, Unread, In Progress, and Completed.
2. WHEN the user selects a read status pill, THE Library_View SHALL filter the comic list to show only comics matching the selected Read_Status.
3. WHEN the "All" read status pill is selected, THE Library_View SHALL display comics regardless of Read_Status.
4. THE Library_View SHALL classify a comic as `unread` when the comic's lastPage is null and lastRead is null.
5. THE Library_View SHALL classify a comic as `in-progress` when the comic's lastPage is not null or lastRead is not null, and the comic is not `completed`.
6. THE Library_View SHALL classify a comic as `completed` when the comic's lastPage equals the comic's pageCount minus one.
7. THE Filter_Bar SHALL visually highlight the currently active read status pill.

### Requirement 4: Filter by File Type

**User Story:** As a reader, I want to filter my library by file type, so that I can browse only CBZ, CBR, or other specific archive formats.

#### Acceptance Criteria

1. THE Filter_Bar SHALL display file type pill buttons with the options: All, CBZ, CBR, PDF, and EPUB.
2. WHEN the user selects a file type pill, THE Library_View SHALL filter the comic list to show only comics whose file path ends with the selected extension.
3. WHEN the "All" file type pill is selected, THE Library_View SHALL display comics regardless of file extension.
4. THE Filter_Bar SHALL visually highlight the currently active file type pill.

### Requirement 5: Filter by Tag

**User Story:** As a reader, I want to filter my library by tag, so that I can browse comics grouped by categories I have assigned.

#### Acceptance Criteria

1. THE Filter_Bar SHALL display a tag selector control that lists all tags present in the library.
2. WHEN the user selects a tag from the tag selector, THE Library_View SHALL filter the comic list to show only comics that have the selected tag assigned.
3. WHEN the user clears the tag selection, THE Library_View SHALL display comics regardless of tag assignment.
4. WHEN no tags exist in the library, THE Library_View SHALL hide the tag selector control.

### Requirement 6: Composable Filters

**User Story:** As a reader, I want to combine multiple filters simultaneously, so that I can narrow down my library to a precise subset of comics.

#### Acceptance Criteria

1. WHEN multiple filters are active (read status, file type, tag, and search query), THE Library_View SHALL apply all active filters as a logical AND and display only comics that satisfy every active filter.
2. WHEN the user changes any single filter, THE Library_View SHALL preserve the state of all other active filters.
3. THE Library_View SHALL display the total count of comics matching the current combined filter set.

### Requirement 7: Persist Sort and Filter Preferences

**User Story:** As a reader, I want my sort and filter choices to be remembered, so that I do not have to reconfigure them every time I open the application.

#### Acceptance Criteria

1. WHEN the user changes the Sort_Field, sort direction, read status filter, file type filter, or tag filter, THE Application SHALL persist the updated Filter_Preset to the App_Meta_Store.
2. WHEN the Library_View loads, THE Application SHALL restore the previously persisted Filter_Preset from the App_Meta_Store and apply it to the initial query.
3. IF no persisted Filter_Preset exists in the App_Meta_Store, THEN THE Application SHALL use the default settings: Sort_Field `title`, sort direction ascending, no read status filter, no file type filter, and no tag filter.

### Requirement 8: Filter and Sort in Context Views

**User Story:** As a reader, I want sort and filter controls to work consistently when browsing within a library collection or a virtual folder, so that I have the same browsing experience everywhere.

#### Acceptance Criteria

1. WHEN the user is viewing comics within a specific library collection, THE Library_View SHALL apply the active Sort_Field, sort direction, and all filters to the library-scoped query.
2. WHEN the user is viewing comics within a virtual folder, THE Library_View SHALL apply the active Sort_Field, sort direction, and all filters to the folder-scoped query.
3. THE Library_View SHALL use the same Filter_Bar and Sort_Control components across the main library view, library collection views, and folder views.

### Requirement 9: Extend Query Options for Read Status

**User Story:** As a developer, I want the database query layer to support filtering by read status, so that the Library_View can request filtered results from the backend.

#### Acceptance Criteria

1. THE Query_Options interface SHALL include a `readStatus` field accepting the values `unread`, `in-progress`, or `completed`.
2. WHEN `readStatus` is `unread`, THE Library_View query SHALL return only comics where lastPage is null and lastRead is null.
3. WHEN `readStatus` is `in-progress`, THE Library_View query SHALL return only comics where lastPage is not null or lastRead is not null, and the comic is not completed.
4. WHEN `readStatus` is `completed`, THE Library_View query SHALL return only comics where lastPage equals pageCount minus one.
5. THE `readStatus` filter SHALL compose with all other existing Query_Options filters (search, tag, fileExt, sortBy, sortOrder, mediaType).
