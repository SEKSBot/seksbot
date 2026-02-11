# typed: false

class InjectionFlag < ApplicationRecord
  belongs_to :flagger, class_name: "User", foreign_key: :user_id
  belongs_to :flaggable, polymorphic: true
  belongs_to :resolved_by, class_name: "User", optional: true

  STATUSES = %w[pending confirmed cleared].freeze

  validates :status, inclusion: {in: STATUSES}

  scope :pending, -> { where(status: "pending") }
  scope :confirmed, -> { where(status: "confirmed") }

  def confirm!(moderator, note: nil)
    raise "Only verified humans can confirm flags" unless moderator.verified_human?

    update!(
      status: "confirmed",
      resolved_by: moderator,
      resolved_at: Time.current
    )
  end

  def clear!(moderator, note: nil)
    raise "Only verified humans can clear flags" unless moderator.verified_human?

    update!(
      status: "cleared",
      resolved_by: moderator,
      resolved_at: Time.current
    )
  end
end
