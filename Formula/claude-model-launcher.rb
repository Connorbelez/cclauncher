class ClaudeModelLauncher < Formula
  desc "TUI for managing Claude Code model configurations"
  homepage "https://github.com/Connorbelez/cclauncher"
  url "https://registry.npmjs.org/claude-model-launcher/-/claude-model-launcher-1.0.0.tgz"
  sha256 "280d976a5ec20487a4ccd4b0fcabf9a866c855ad5e47d356bfdcbce891d9f9b8"
  license "Apache-2.0"

  depends_on "oven-sh/bun/bun"

  ##
  # Installs all package files into `libexec` and creates a `bin/cclauncher` symlink pointing to `libexec/dist/cli.js`.
  def install
    libexec.install Dir["*"]
    bin.install_symlink libexec/"dist/cli.js" => "cclauncher"
  end

  test do
    assert_match "CCLauncher", shell_output("#{bin}/cclauncher --version")
  end
end