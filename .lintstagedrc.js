module.exports = {
  '*.{ts,tsx,js,jsx}': [
    'prettier --write',
    'eslint --fix',
  ],
  '*.{json,md,yml,yaml}': [
    'prettier --write',
  ],
};
