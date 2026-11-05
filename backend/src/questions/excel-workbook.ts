import { CellValue, Workbook } from 'exceljs';
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS } from './excel-import';

export interface SheetRow {
  /** Số dòng trong Excel (bắt đầu từ 1, dòng 1 là tiêu đề) */
  rowNumber: number;
  cells: string[];
}

/** Đổi giá trị ô Excel (số, ngày, rich text, công thức...) thành chuỗi. */
function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    // Ô công thức: lấy kết quả đã tính (có thể là số, chuỗi, ngày...)
    if ('result' in value) return cellText(value.result);
    if ('text' in value && typeof value.text === 'string') return value.text;
    return '';
  }
  return String(value);
}

export class ImportFileError extends Error {}

/** Đọc sheet đầu tiên, bỏ dòng tiêu đề và các dòng trống. */
export async function readQuestionRows(buffer: Buffer): Promise<SheetRow[]> {
  const workbook = new Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError('File không phải định dạng .xlsx hợp lệ');
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new ImportFileError('File không có sheet nào');

  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells = IMPORT_COLUMNS.map((_, i) =>
      cellText(row.getCell(i + 1).value),
    );
    if (cells.every((c) => c.trim() === '')) return;
    rows.push({ rowNumber, cells });
  });

  if (rows.length === 0) throw new ImportFileError('File không có câu hỏi nào');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(
      `Mỗi lần chỉ nhập tối đa ${MAX_IMPORT_ROWS} câu hỏi`,
    );
  }
  return rows;
}

const SAMPLE_ROWS = [
  [
    'Địa lý',
    '1 đáp án',
    'Dễ',
    'Thủ đô của Việt Nam là?',
    'Hà Nội',
    'Huế',
    'Đà Nẵng',
    'TP. Hồ Chí Minh',
    '',
    '',
    'A',
    'Hà Nội là thủ đô từ năm 1010.',
  ],
  [
    'Toán',
    'Nhiều đáp án',
    'Trung bình',
    'Những số nào là số nguyên tố?',
    '2',
    '4',
    '7',
    '9',
    '',
    '',
    'A, C',
    '',
  ],
  [
    'Lập trình',
    'Đúng/Sai',
    'Khó',
    'JavaScript và Java là cùng một ngôn ngữ.',
    '',
    '',
    '',
    '',
    '',
    '',
    'Sai',
    'Hai ngôn ngữ khác nhau, chỉ giống tên.',
  ],
];

/** File mẫu cho giảng viên điền: tiêu đề, 3 dòng ví dụ và danh sách chọn. */
export async function buildQuestionTemplate(): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('Câu hỏi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow([...IMPORT_COLUMNS]);
  sheet.getRow(1).font = { bold: true };
  SAMPLE_ROWS.forEach((r) => sheet.addRow(r));

  const widths = [16, 14, 12, 48, 18, 18, 18, 18, 18, 18, 14, 40];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  for (let r = 2; r <= MAX_IMPORT_ROWS + 1; r++) {
    sheet.getCell(r, 2).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"1 đáp án,Nhiều đáp án,Đúng/Sai"'],
    };
    sheet.getCell(r, 3).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Dễ,Trung bình,Khó"'],
    };
  }

  const guide = workbook.addWorksheet('Hướng dẫn');
  [
    'Mỗi dòng ở sheet "Câu hỏi" là một câu hỏi. Giữ nguyên dòng tiêu đề.',
    'Loại: 1 đáp án, Nhiều đáp án hoặc Đúng/Sai.',
    'Độ khó: Dễ, Trung bình hoặc Khó.',
    'Đáp án A-F: điền ít nhất 2 phương án (câu Đúng/Sai để trống).',
    'Đáp án đúng: chữ cái của phương án đúng, vd. A hoặc A, C. Câu Đúng/Sai ghi Đúng hoặc Sai.',
    'Chủ đề chưa có trong khóa học sẽ được tạo tự động.',
    'Nếu có dòng sai, hệ thống không nhập dòng nào và báo lỗi theo số dòng để bạn sửa.',
  ].forEach((line) => guide.addRow([line]));
  guide.getColumn(1).width = 100;

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
