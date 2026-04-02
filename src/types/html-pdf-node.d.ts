declare module 'html-pdf-node' {
  interface File {
    content?: string;
    url?: string;
  }
  interface Options {
    format?: string;
    printBackground?: boolean;
    margin?: { top?: string; bottom?: string; left?: string; right?: string };
    args?: string[];
  }
  function generatePdf(file: File, options: Options): Promise<Buffer>;
  function generatePdfs(files: File[], options: Options): Promise<Buffer[]>;
}
