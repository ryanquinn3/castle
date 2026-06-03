FROM mcr.microsoft.com/devcontainers/typescript-node:1-26-bookworm

ARG USERNAME=node

# Used to persist shell history
RUN mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && touch /commandhistory/.zsh_history \
    && chown -R $USERNAME /commandhistory \
    && echo 'export PROMPT_COMMAND="history -a" && export HISTFILE=/commandhistory/.bash_history' >> "/home/$USERNAME/.bashrc" \
    && echo 'export HISTFILE=/commandhistory/.zsh_history' >> "/home/$USERNAME/.zshrc"

# Create claude config directories and set permissions
RUN mkdir -p /home/$USERNAME/.claude && \
  chown -R $USERNAME /home/$USERNAME/.claude

RUN mkdir -p /home/$USERNAME/.cache && \
  chown -R $USERNAME /home/$USERNAME/.cache
