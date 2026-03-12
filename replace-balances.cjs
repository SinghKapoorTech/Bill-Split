const replace = require('replace-in-file');

const options = {
  files: [
    'src/**/*',
    'functions/**/*',
    'firestore.rules',
    'docs/**/*',
    'CLAUDE.md'
  ],
  from: /friend_balances/g,
  to: 'balances',
  ignore: [
    'node_modules/**/*',
    '.git/**/*',
    'dist/**/*',
    'build/**/*'
  ]
};

try {
  const results = replace.sync(options);
  console.log('Replacement results:', results.filter(r => r.hasChanged).map(r => r.file));
}
catch (error) {
  console.error('Error occurred:', error);
}
