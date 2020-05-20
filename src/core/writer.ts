import {writeFileSync} from 'fs'; 


export interface Writer{
    write(buffer: string) : void
}

export class FileWriter implements Writer{
    private file_path: string;
    constructor(file_path: string){
        this.file_path = file_path;
    }
    write(buffer: string): void {
        writeFileSync(this.file_path, buffer)
    }
    
}
export class StdOutWriter implements Writer{
    
    write(buffer: string): void {
        process.stdout.write(buffer)
    }

}