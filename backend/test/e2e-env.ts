// Hàng đợi riêng cho e2e: backend dev đang chạy cùng Redis sẽ không lấy mất job chấm bài của test
process.env.QUEUE_PREFIX ??= 'hton-e2e';
