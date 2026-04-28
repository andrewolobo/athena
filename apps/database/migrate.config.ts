import "dotenv/config";

const config = {
  dev: {
    url: process.env.DATABASE_URL,
    dir: "migrations",
    direction: "up",
    verbose: true,
    decamelize: true,
  },
  test: {
    url: process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL,
    dir: "migrations",
    direction: "up",
    verbose: false,
    decamelize: true,
  },
  prod: {
    url: process.env.DATABASE_URL,
    dir: "migrations",
    direction: "up",
    verbose: true,
    decamelize: true,
  },
};

export default config;
