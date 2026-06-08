-- Supabase SQL Editor에서 1회 실행 (예전 스키마 + 앱 테이블 초기화)
-- 이후 Render DB_SYNCHRONIZE=true 로 1번 배포 → 테이블 자동 생성 → false 로 되돌리기

-- 구버전 (FK가 users_pkey 에 걸려 있음)
DROP TABLE IF EXISTS points_ledger CASCADE;
DROP TABLE IF EXISTS trade_transactions CASCADE;
DROP TABLE IF EXISTS portfolios CASCADE;

-- 현재 Nest 앱 테이블
DROP TABLE IF EXISTS community_messages CASCADE;
DROP TABLE IF EXISTS price_snapshots CASCADE;
DROP TABLE IF EXISTS user_week_stats CASCADE;
DROP TABLE IF EXISTS trades CASCADE;
DROP TABLE IF EXISTS positions CASCADE;
DROP TABLE IF EXISTS instruments CASCADE;
DROP TABLE IF EXISTS users CASCADE;
