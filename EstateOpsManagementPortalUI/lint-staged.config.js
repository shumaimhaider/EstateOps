export default {
  '*.{js,jsx}': ['prettier --write', 'eslint --fix'],
  '*': 'prettier --write --ignore-unknown',
};
