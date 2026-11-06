cat <<EOF
# here-document data, not a shell comment
${HOME#prefix}
$(printf '%s\n' value # command substitution comment
)
EOF
# shell source comment
