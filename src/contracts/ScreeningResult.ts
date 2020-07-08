import { FolderAlias } from "./Folder";

export enum ScreeningResultType {
    RequiresManualScreening = 10,
    TargetFolder = 20
}

export interface ScreeningResult {
    result: ScreeningResultType
    targetFolderAlias?: FolderAlias
}