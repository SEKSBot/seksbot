# typed: false

module InjectionFlaggable
  extend ActiveSupport::Concern

  included do
    has_many :injection_flags, as: :flaggable, dependent: :destroy

    scope :visible_to_ai, -> { where(injection_hidden: false) }
    scope :injection_flagged, -> { where("injection_flag_count > 0") }
  end

  # Configurable threshold: how many flags before content is hidden
  INJECTION_HIDE_THRESHOLD = 2

  def visible_to?(user)
    return true unless injection_hidden?
    return false if user.nil? # Logged-out users can't see flagged content (bots browse without auth)
    return true unless user.is_ai_user?
    return true if user.verified_human?

    false
  end

  def hidden_reason_for(user)
    return nil if visible_to?(user)

    "[Content hidden: flagged as potential injection - #{injection_flag_count} flag(s)]"
  end
end
