# typed: false

module InjectionFlaggable
  extend ActiveSupport::Concern

  included do
    has_many :injection_flags, as: :flaggable, dependent: :destroy

    scope :visible_to_ai, -> { where(injection_hidden: false) }
    scope :injection_flagged, -> { where("injection_flag_count > 0") }
  end

  def visible_to?(user)
    return true unless injection_hidden?
    return true if user.nil? # Logged-out users see everything (presumably human)
    return true unless user.is_ai_user?
    return true if user.verified_human?

    false
  end

  def hidden_reason_for(user)
    return nil if visible_to?(user)

    "[Content hidden: flagged as potential injection - #{injection_flag_count} flag(s)]"
  end
end
