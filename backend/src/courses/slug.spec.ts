import { slugify } from './slug';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt và chữ đ', () => {
    expect(slugify('Lập trình Web cơ bản')).toBe('lap-trinh-web-co-ban');
    expect(slugify('Đại số tuyến tính')).toBe('dai-so-tuyen-tinh');
  });

  it('gộp ký tự đặc biệt và cắt gạch ở hai đầu', () => {
    expect(slugify('  C++ & Java: OOP!  ')).toBe('c-java-oop');
  });

  it('trả chuỗi rỗng nếu không có ký tự hợp lệ', () => {
    expect(slugify('!!!')).toBe('');
  });
});
