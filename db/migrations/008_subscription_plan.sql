alter table subscriptions add column if not exists plan text not null default 'business' check (plan in ('starter','business','pro'));
