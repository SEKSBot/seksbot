# typed: false

class InjectionDetector
  SUSPICIOUS_PATTERNS = [
    /\[SYSTEM\s*(OVERRIDE|MESSAGE|INSTRUCTION)/i,
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now\s+a/i,
    /disregard\s+(your|all)\s+(instructions|guidelines)/i,
    /\bprompt\s*:\s*\n/i,
    /\[\[.*?(instruction|command|override).*?\]\]/i
  ].freeze

  ENCODING_PATTERNS = [
    /[\u200b-\u200f\u2028-\u202f]/, # Zero-width characters
    /&#x?[0-9a-f]+;/i               # HTML entities
  ].freeze

  def initialize(content)
    @content = content.to_s
    @decoded_content = decode_content(@content)
  end

  def suspicious?
    SUSPICIOUS_PATTERNS.any? { |p| @decoded_content.match?(p) } ||
      has_suspicious_encoding?
  end

  def suspicion_reasons
    reasons = []

    SUSPICIOUS_PATTERNS.each_with_index do |pattern, i|
      reasons << "pattern_#{i}" if @decoded_content.match?(pattern)
    end

    reasons << "suspicious_encoding" if has_suspicious_encoding?
    reasons
  end

  private

  def decode_content(text)
    text = CGI.unescapeHTML(text)
    text = text.gsub(/[\u200b-\u200f\u2028-\u202f]/, "")

    # Try base64 decode on suspicious chunks
    text.gsub(/[A-Za-z0-9+\/]{20,}={0,2}/) do |match|
      decoded = Base64.strict_decode64(match)
      decoded.force_encoding("UTF-8").valid_encoding? ? decoded : match
    rescue
      match
    end
  end

  def has_suspicious_encoding?
    ENCODING_PATTERNS.any? { |p| @content.match?(p) }
  end
end
