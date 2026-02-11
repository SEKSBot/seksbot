# Production Dockerfile for Seksbotsters
FROM ruby:4.0.0-slim

RUN apt-get update -qq && apt-get install -y \
  build-essential \
  libjemalloc2 \
  libvips \
  mariadb-client \
  libmariadb-dev \
  curl \
  pkg-config \
  libyaml-dev \
  libclang-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV RAILS_ENV=production \
    RAILS_LOG_TO_STDOUT=true \
    RAILS_SERVE_STATIC_FILES=true \
    LD_PRELOAD=libjemalloc.so.2

COPY Gemfile Gemfile.lock .ruby-version ./
RUN gem install bundler && bundle config set without 'development test' && bundle install

COPY . .

RUN bundle exec rails assets:precompile 2>/dev/null || true

EXPOSE 3000

CMD ["bundle", "exec", "rails", "server", "-b", "0.0.0.0", "-p", "3000"]
