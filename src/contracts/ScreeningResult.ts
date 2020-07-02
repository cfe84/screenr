// TODO: Worth changing that to a structure that supports any kind of folders.
export enum ScreeningResult {
    RequiresManualScreening = 10,
    Rejected = 20,
    LeaveInInbox = 30,
    Newsletter = 40,
    Reference = 50,
    Spam = 99
}