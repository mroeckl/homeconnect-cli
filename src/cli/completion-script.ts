export function completionScript(shell: string): string {
  const bashWordsRef = `\${COMP_WORDS[@]:1}`;

  if (shell === 'zsh') {
    return [
      '#compdef hc',
      '_hc() {',
      '  _arguments "*: :->args"',
      '  if [[ $state == args ]]; then',
      '    local -a args suggestions',
      `    args=("\${(@Q)words[@]}")`,
      `    suggestions=(\${(f)"$(hc __complete "\${args[@]}")"})`,
      '    _describe "values" suggestions',
      '  fi',
      '}',
      '',
      '_hc "$@"',
    ].join('\n');
  }

  return [
    '#!/usr/bin/env bash',
    '_hc_complete() {',
    '  local IFS=$"\\n"',
    `  COMPREPLY=( $( hc __complete "${bashWordsRef}" ) )`,
    '}',
    'complete -F _hc_complete hc',
  ].join('\n');
}
