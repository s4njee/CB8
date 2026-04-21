# Requirements Document

## Introduction

A desktop comic book reader application built with Electron and TypeScript. The application allows users to open, view, and navigate comic book archive files in CBZ (ZIP-based) and CBR (RAR-based) formats. It provides keyboard-driven page navigation and a fullscreen viewing mode for an immersive reading experience. The application includes a persistent comic library with efficient indexing, search, tagging, and virtualized browsing designed to handle collections of 100,000 or more comics.

## Glossary

- **Application**: The comic book reader Electron desktop application
- **CBZ_File**: A comic book archive using ZIP compression, containing sequentially named image files representing pages
- **CBR_File**: A comic book archive using RAR compression, containing sequentially named image files representing pages
- **Archive_Loader**: The component responsible for opening and extracting image data from comic book archive files (CBZ or CBR)
- **Image_View**: The central component that displays the current comic page, scaled to fit the viewport
- **Page_Index**: A zero-based integer identifying the current page position within the loaded archive
- **Natural_Sort_Order**: A sorting algorithm that orders filenames by treating embedded numeric sequences as numbers rather than character strings (e.g., page2 before page10)
- **Library**: The persistent collection of comic book metadata records managed by the Application, stored in a local database
- **Library_Index**: The component responsible for indexing, querying, and managing comic book metadata within the Library database
- **Comic_Record**: A metadata entry in the Library representing a single comic book archive, including file path, title, page count, file size, cover thumbnail, and user-assigned tags
- **Library_View**: The UI component that displays the Library contents as a scrollable, virtualized grid of comic book entries
- **Virtual_Scroll**: A rendering technique that creates and displays only the UI elements currently visible in the viewport, enabling smooth scrolling through large datasets without loading all items into memory
- **Search_Query**: A text string used to filter Comic_Records by title, file path, or tag
- **Scan_Operation**: The process of recursively traversing a directory tree to discover comic book archive files and create or update corresponding Comic_Records in the Library
- **Cover_Image**: The image selected from a comic book archive to serve as the cover thumbnail. If the archive contains a file whose name (excluding extension) is exactly "cover" with a recognized image extension (e.g., cover.jpg, cover.png, cover.jxl), that file is used. Otherwise, the first image in Natural_Sort_Order is used.

## Requirements

### Requirement 1: Load CBZ Archives

**User Story:** As a reader, I want to open CBZ files, so that I can view ZIP-based comic book archives.

#### Acceptance Criteria

1. WHEN a valid CBZ_File path is provided, THE Archive_Loader SHALL open the ZIP archive and extract the list of image entries.
2. WHEN image entries are extracted from a CBZ_File, THE Archive_Loader SHALL sort the entries in Natural_Sort_Order by filename.
3. WHEN a page at a valid Page_Index is requested, THE Archive_Loader SHALL return the raw image byte data for that entry.
4. IF the CBZ_File cannot be opened or is corrupted, THEN THE Archive_Loader SHALL return a descriptive error message without crashing.
5. THE Archive_Loader SHALL recognize files with extensions jpg, jpeg, png, webp, gif, bmp, jxl, and avif as image entries.

### Requirement 2: Load CBR Archives

**User Story:** As a reader, I want to open CBR files, so that I can view RAR-based comic book archives.

#### Acceptance Criteria

1. WHEN a valid CBR_File path is provided, THE Archive_Loader SHALL open the RAR archive and extract the list of image entries.
2. WHEN image entries are extracted from a CBR_File, THE Archive_Loader SHALL sort the entries in Natural_Sort_Order by filename.
3. WHEN a page at a valid Page_Index is requested from a CBR_File, THE Archive_Loader SHALL return the raw image byte data for that entry.
4. IF the CBR_File cannot be opened or is corrupted, THEN THE Archive_Loader SHALL return a descriptive error message without crashing.
5. THE Archive_Loader SHALL recognize files with extensions jpg, jpeg, png, webp, gif, bmp, jxl, and avif as image entries within CBR archives.

### Requirement 3: Display Comic Pages

**User Story:** As a reader, I want to see comic pages scaled to fit my window, so that I can read comfortably at any window size.

#### Acceptance Criteria

1. WHEN a page image is loaded, THE Image_View SHALL display the image scaled to fit the viewport while preserving the original aspect ratio.
2. WHEN the Application window is resized, THE Image_View SHALL re-scale the displayed image to fit the new viewport dimensions.
3. WHEN no archive is loaded, THE Image_View SHALL display an empty view with a black background.

### Requirement 4: Keyboard Page Navigation

**User Story:** As a reader, I want to turn pages using keyboard keys, so that I can navigate the comic without using a mouse.

#### Acceptance Criteria

1. WHEN the Right arrow key or Space key is pressed and the Page_Index is less than the last page, THE Application SHALL advance to the next page.
2. WHEN the Left arrow key or Backspace key is pressed and the Page_Index is greater than zero, THE Application SHALL go back to the previous page.
3. WHEN the Home key is pressed and an archive is loaded, THE Application SHALL navigate to the first page.
4. WHEN the End key is pressed and an archive is loaded, THE Application SHALL navigate to the last page.
5. WHEN the Right arrow key is pressed on the last page, THE Application SHALL remain on the last page without error.
6. WHEN the Left arrow key is pressed on the first page, THE Application SHALL remain on the first page without error.

### Requirement 5: Fullscreen Toggle

**User Story:** As a reader, I want to toggle fullscreen mode with F11, so that I can have an immersive reading experience.

#### Acceptance Criteria

1. WHEN the F11 key is pressed and the Application is in windowed mode, THE Application SHALL switch to fullscreen mode.
2. WHEN the F11 key is pressed and the Application is in fullscreen mode, THE Application SHALL switch back to windowed mode restoring the previous window size and position.
3. WHEN the Escape key is pressed and the Application is in fullscreen mode, THE Application SHALL switch back to windowed mode.
4. WHILE the Application is in fullscreen mode, THE Image_View SHALL continue to scale pages to fit the fullscreen viewport.

### Requirement 6: Open File Dialog

**User Story:** As a reader, I want to open comic files through a file dialog, so that I can browse and select archives from my filesystem.

#### Acceptance Criteria

1. WHEN the user selects File > Open from the menu, THE Application SHALL display a file dialog.
2. THE file dialog SHALL filter for files with CBZ and CBR extensions.
3. WHEN a file is selected in the dialog, THE Application SHALL load the selected archive and display the first page.
4. WHEN the user cancels the file dialog, THE Application SHALL remain in the current state without changes.

### Requirement 7: Drag and Drop Loading

**User Story:** As a reader, I want to drag and drop comic files onto the window, so that I can quickly open archives.

#### Acceptance Criteria

1. WHEN a CBZ_File or CBR_File is dragged over the Application window, THE Application SHALL indicate that the drop is accepted.
2. WHEN a CBZ_File or CBR_File is dropped onto the Application window, THE Application SHALL load the dropped archive and display the first page.
3. WHEN a file that is not a CBZ_File or CBR_File is dragged over the Application window, THE Application SHALL reject the drop.

### Requirement 8: Status Bar Page Indicator

**User Story:** As a reader, I want to see my current page position, so that I know where I am in the comic.

#### Acceptance Criteria

1. WHILE an archive is loaded, THE Application SHALL display the current page number and total page count in the status bar in the format "X / Y" where X is the one-based current page and Y is the total page count.
2. WHEN the page changes, THE Application SHALL update the status bar to reflect the new Page_Index.
3. WHEN no archive is loaded, THE Application SHALL display an empty status bar.

### Requirement 9: Window Title

**User Story:** As a reader, I want the window title to show the current file name, so that I can identify which comic is open.

#### Acceptance Criteria

1. WHEN an archive is loaded, THE Application SHALL set the window title to include the archive filename.
2. WHEN no archive is loaded, THE Application SHALL display a default application title.

### Requirement 10: Library Persistent Storage

**User Story:** As a reader, I want my comic library to be saved between sessions, so that I do not have to re-import comics every time I open the Application.

#### Acceptance Criteria

1. THE Library_Index SHALL store all Comic_Records in a local SQLite database file in the Application data directory.
2. WHEN the Application starts, THE Library_Index SHALL open the existing Library database and make all previously stored Comic_Records available.
3. WHEN a Comic_Record is added, updated, or removed, THE Library_Index SHALL persist the change to the database within one second.
4. THE Library_Index SHALL store the following metadata for each Comic_Record: file path, title, page count, file size in bytes, cover thumbnail image, and date added.
5. IF the Library database file is missing or corrupted at startup, THEN THE Library_Index SHALL create a new empty database and log a warning message.

### Requirement 11: Scan Directories for Comics

**User Story:** As a reader, I want to scan folders on my filesystem for comics, so that I can quickly add large collections to my Library.

#### Acceptance Criteria

1. WHEN the user initiates a Scan_Operation on a directory path, THE Library_Index SHALL recursively discover all CBZ_File and CBR_File entries within that directory tree.
2. WHEN a comic archive is discovered during a Scan_Operation, THE Library_Index SHALL extract metadata and a Cover_Image thumbnail and create a Comic_Record for the archive.
3. WHEN a Scan_Operation discovers a file that already exists in the Library by file path, THE Library_Index SHALL skip that file without creating a duplicate Comic_Record.
4. WHILE a Scan_Operation is in progress, THE Application SHALL display a progress indicator showing the number of files discovered and processed.
5. THE Library_Index SHALL process a Scan_Operation asynchronously so that the Application UI remains responsive during scanning.
6. IF a comic archive cannot be read during a Scan_Operation, THEN THE Library_Index SHALL skip that file, log the error, and continue scanning remaining files.
7. WHEN extracting a Cover_Image from an archive, THE Archive_Loader SHALL use a file named "cover" (case-insensitive, any recognized image extension) if one exists; otherwise THE Archive_Loader SHALL use the first image in Natural_Sort_Order.

### Requirement 12: Library Browsing with Virtual Scrolling

**User Story:** As a reader, I want to browse my comic library smoothly even with 100,000 or more comics, so that the interface remains responsive regardless of collection size.

#### Acceptance Criteria

1. THE Library_View SHALL display Comic_Records as a grid of cover thumbnails with titles.
2. THE Library_View SHALL use Virtual_Scroll to render only the cover thumbnails visible in the current viewport plus a buffer of one additional row above and below.
3. WHEN the user scrolls the Library_View containing 100,000 Comic_Records, THE Library_View SHALL maintain a frame rate of at least 30 frames per second.
4. WHEN a Comic_Record cover thumbnail is not yet loaded, THE Library_View SHALL display a placeholder image until the thumbnail is available.
5. WHEN the user double-clicks a Comic_Record in the Library_View, THE Application SHALL open the associated archive and display the first page.

### Requirement 13: Library Search and Filter

**User Story:** As a reader, I want to search and filter my comic library, so that I can quickly find specific comics in a large collection.

#### Acceptance Criteria

1. WHEN the user enters a Search_Query, THE Library_Index SHALL return matching Comic_Records where the title or file path contains the Search_Query text, using case-insensitive matching.
2. WHEN a Search_Query is submitted against a Library of 100,000 Comic_Records, THE Library_Index SHALL return results within 200 milliseconds.
3. WHEN the user clears the Search_Query, THE Library_View SHALL display all Comic_Records in the Library.
4. THE Library_Index SHALL support filtering Comic_Records by user-assigned tag.
5. WHEN a tag filter is active and a Search_Query is entered, THE Library_Index SHALL return only Comic_Records matching both the tag filter and the Search_Query.

### Requirement 14: Library Indexing for Large Collections

**User Story:** As a reader, I want my comic library to be efficiently indexed, so that adding, removing, and querying comics remains fast as my collection grows.

#### Acceptance Criteria

1. THE Library_Index SHALL create database indexes on the file path, title, and tag columns of the Comic_Record table.
2. WHEN a new Comic_Record is inserted into a Library containing 100,000 existing records, THE Library_Index SHALL complete the insertion within 50 milliseconds.
3. WHEN a Comic_Record is removed from the Library, THE Library_Index SHALL delete the record and its associated thumbnail data from the database.
4. THE Library_Index SHALL support sorting Comic_Records by title, date added, file size, and page count.
5. WHEN the sort order is changed on a Library of 100,000 Comic_Records, THE Library_View SHALL display the re-sorted results within 500 milliseconds.

### Requirement 15: Comic Tagging

**User Story:** As a reader, I want to assign tags to my comics, so that I can organize and categorize my collection.

#### Acceptance Criteria

1. WHEN the user assigns a tag to a Comic_Record, THE Library_Index SHALL persist the tag association in the Library database.
2. WHEN the user removes a tag from a Comic_Record, THE Library_Index SHALL remove the tag association from the Library database.
3. THE Library_Index SHALL allow multiple tags to be assigned to a single Comic_Record.
4. THE Library_Index SHALL allow a single tag to be shared across multiple Comic_Records.
5. WHEN a tag has no remaining Comic_Record associations, THE Library_Index SHALL retain the tag for future use.

### Requirement 16: Remove Comics from Library

**User Story:** As a reader, I want to remove comics from my library, so that I can keep my collection organized and remove entries for files I no longer have.

#### Acceptance Criteria

1. WHEN the user selects one or more Comic_Records and chooses the remove action, THE Library_Index SHALL delete the selected Comic_Records from the Library database.
2. WHEN a Comic_Record is removed from the Library, THE Application SHALL not delete the underlying archive file from the filesystem.
3. WHEN Comic_Records are removed, THE Library_View SHALL update to no longer display the removed entries.
4. IF the user initiates a remove action, THEN THE Application SHALL display a confirmation prompt before deleting the Comic_Records.
